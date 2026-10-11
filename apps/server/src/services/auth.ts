import {
  type SessionRecord,
  type UserRecord,
  claimTotpStep,
  clearAttempts,
  createSession,
  deleteSession,
  getOwner,
  getSession,
  getTotp,
  recordAttempt,
  refundAttempt,
  touchSession,
  useRecoveryCode,
} from "@mewte/db";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Deps } from "../deps";
import { ApiError } from "../errors";
import { randomToken, sha256Hex } from "./crypto";
import { hashRecoveryCode, verifyTotp } from "./totp";

export const SESSION_COOKIE = "mewte_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS_PER_CLIENT = 5;
export const MAX_ATTEMPTS_PER_ADDRESS = 20;
export const MAX_ATTEMPTS_PER_USER = 50;

const FAILURE_DELAY_BASE_MS = 2000;
const FAILURE_DELAY_STEP_MS = 1000;
const FAILURE_DELAY_MAX_MS = 8000;
const FAILURE_DELAY_JITTER_MS = 1000;

// ---------- client address and cookies ----------

/** The caller's address. Proxy headers count only when TRUST_PROXY says they are ours. */
export function clientAddress(deps: Deps, c: Context): string {
  if (deps.config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return deps.remoteAddress(c) ?? "unknown";
}

function isSecureRequest(deps: Deps, c: Context): boolean {
  if (deps.config.cookieSecure !== "auto") return deps.config.cookieSecure === "true";
  if (deps.config.trustProxy) {
    const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) return proto === "https";
  }
  return new URL(c.req.url).protocol === "https:";
}

function cookieOptions(deps: Deps, c: Context) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    // Plain-HTTP installs on a LAN are common for self-hosting, so this follows the request.
    secure: isSecureRequest(deps, c),
  };
}

// ---------- sessions ----------

export async function startSession(deps: Deps, c: Context, userId: string): Promise<void> {
  const token = randomToken();
  const now = deps.now();
  await createSession(deps.conn, {
    id: await sha256Hex(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  setCookie(c, SESSION_COOKIE, token, {
    ...cookieOptions(deps, c),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function currentSession(
  deps: Deps,
  c: Context,
): Promise<{ session: SessionRecord; user: UserRecord } | undefined> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return undefined;
  const now = deps.now();
  const session = await getSession(deps.conn, await sha256Hex(token), now);
  if (!session) return undefined;
  const user = await getOwner(deps.conn);
  if (!user || user.id !== session.userId) return undefined;
  if (now - session.lastSeenAt > SESSION_TOUCH_INTERVAL_MS) {
    await touchSession(deps.conn, session.id, now, now + SESSION_TTL_MS);
  }
  return { session, user };
}

export async function endSession(deps: Deps, c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(deps.conn, await sha256Hex(token));
  deleteCookie(c, SESSION_COOKIE, cookieOptions(deps, c));
}

// ---------- attempt limits ----------

type BucketKind = "client" | "address" | "user";

interface Bucket {
  kind: BucketKind;
  key: string;
  max: number;
}

/**
 * Three counters guard every credential check. `client` is one browser on one address;
 * its User-Agent is easy to fake, so `address` still caps a caller that rotates it.
 * `user` is the ceiling for guesses spread over many addresses. It sits above the
 * address limit so that a single address cannot lock the owner out.
 */
async function attemptBuckets(deps: Deps, c: Context, username?: string): Promise<Bucket[]> {
  const address = clientAddress(deps, c);
  const fingerprint = await sha256Hex(
    [address, c.req.header("user-agent") ?? "", c.req.header("accept-language") ?? ""].join("\n"),
  );
  const list: Bucket[] = [
    { kind: "client", key: `client:${fingerprint.slice(0, 40)}`, max: MAX_ATTEMPTS_PER_CLIENT },
    { kind: "address", key: `addr:${address}`.slice(0, 191), max: MAX_ATTEMPTS_PER_ADDRESS },
  ];
  if (username !== undefined) {
    list.push({
      kind: "user",
      key: `user:${username.toLowerCase()}`.slice(0, 191),
      max: MAX_ATTEMPTS_PER_USER,
    });
  }
  return list;
}

/** How long a wrong guess waits for its answer: 2 to 3 seconds at first, longer when repeated. */
export function failureDelayMs(attempts: number, random: () => number = Math.random): number {
  const steps = Math.max(0, attempts - 1);
  const base = Math.min(
    FAILURE_DELAY_MAX_MS,
    FAILURE_DELAY_BASE_MS + steps * FAILURE_DELAY_STEP_MS,
  );
  return base + Math.floor(random() * FAILURE_DELAY_JITTER_MS);
}

/**
 * Runs one credential check under the attempt limits.
 *
 * The attempt is charged before `check` runs, so guesses fired in parallel cannot all
 * slip in under a limit. `check` reports a wrong credential by calling `reject`, which
 * keeps the charge and holds the answer back for a while. Returning normally counts as
 * success, and any other error (for example "a two-factor code is required") hands the
 * charge back.
 */
export async function guardCredentials<T>(
  deps: Deps,
  c: Context,
  username: string | undefined,
  check: (reject: (error: ApiError) => Promise<never>) => Promise<T>,
): Promise<T> {
  const buckets = await attemptBuckets(deps, c, username);
  const now = deps.now();

  let clientAttempts = 0;
  let lockedUntil = 0;
  for (const bucket of buckets) {
    const window = await recordAttempt(deps.conn, bucket.key, now, LOGIN_WINDOW_MS);
    if (bucket.kind === "client") clientAttempts = window.attempts;
    if (window.attempts > bucket.max) lockedUntil = Math.max(lockedUntil, window.resetAt);
  }
  if (lockedUntil > 0) {
    // Nothing was checked, so nothing is owed. Keeping the charge would let a client that
    // is already locked out run up the address and account counters for everyone else.
    for (const bucket of buckets) await refundAttempt(deps.conn, bucket.key);
    const retryAfter = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    throw new ApiError(429, "rate_limited", "Too many attempts. Try again later.", {
      "Retry-After": String(retryAfter),
    });
  }

  let rejected = false;
  const reject = async (error: ApiError): Promise<never> => {
    rejected = true;
    await deps.sleep(failureDelayMs(clientAttempts));
    throw error;
  };

  try {
    const result = await check(reject);
    // This client proved itself; the address counter only gives back its own charge.
    for (const bucket of buckets) {
      if (bucket.kind === "address") await refundAttempt(deps.conn, bucket.key);
      else await clearAttempts(deps.conn, bucket.key);
    }
    return result;
  } catch (error) {
    if (!rejected) {
      for (const bucket of buckets) await refundAttempt(deps.conn, bucket.key);
    }
    throw error;
  }
}

// ---------- credentials ----------

/**
 * Checks a TOTP or recovery code. A TOTP code is single-use: its time step is claimed
 * in the database so a captured code cannot be replayed, on this instance or another.
 */
export async function verifySecondFactor(
  deps: Deps,
  userId: string,
  secret: string,
  code: string,
): Promise<boolean> {
  const now = deps.now();
  const step = verifyTotp(secret, code, now);
  if (step !== null) return claimTotpStep(deps.conn, userId, step);
  if (/^\d+$/.test(code)) return false;
  return useRecoveryCode(deps.conn, { userId, codeHash: await hashRecoveryCode(code), now });
}

export async function login(
  deps: Deps,
  c: Context,
  input: { username: string; password: string; code?: string | undefined },
): Promise<UserRecord> {
  return guardCredentials(deps, c, input.username, async (reject) => {
    const owner = await getOwner(deps.conn);
    if (!owner) throw new ApiError(409, "not_initialized", "Mewte has not been set up yet");

    // The hash is checked even for an unknown username, so timing does not tell them apart.
    const passwordOk = await deps.hasher.verify(input.password, owner.passwordHash);
    if (!passwordOk || owner.username !== input.username) {
      return reject(new ApiError(401, "invalid_credentials", "Incorrect username or password"));
    }

    const totp = await getTotp(deps.conn, owner.id);
    if (totp?.enabled) {
      if (!input.code) {
        throw new ApiError(401, "totp_required", "A two-factor code is required");
      }
      const secret = await deps.cipher.decrypt(totp.secretEnc);
      if (!(await verifySecondFactor(deps, owner.id, secret, input.code))) {
        return reject(new ApiError(401, "totp_invalid", "Incorrect two-factor code"));
      }
    }

    await startSession(deps, c, owner.id);
    return owner;
  });
}

/** Re-checks the password before a sensitive change, under the same limits as signing in. */
export async function confirmPassword(
  deps: Deps,
  c: Context,
  user: UserRecord,
  password: string,
): Promise<void> {
  await guardCredentials(deps, c, user.username, async (reject) => {
    if (!(await deps.hasher.verify(password, user.passwordHash))) {
      await reject(new ApiError(403, "wrong_password", "Incorrect password"));
    }
  });
}
