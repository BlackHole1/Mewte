import { Secret, TOTP } from "otpauth";
import { randomToken, sha256Hex } from "./crypto";

const ISSUER = "Mewte";
const PERIOD_SEC = 30;
const RECOVERY_CODE_COUNT = 10;

function build(secret: string, username: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD_SEC,
    secret: Secret.fromBase32(secret),
  });
}

export function generateTotpSecret(username: string): { secret: string; otpauthUrl: string } {
  const secret = new Secret({ size: 20 }).base32;
  return { secret, otpauthUrl: build(secret, username).toString() };
}

/**
 * Checks a code, allowing one period of clock drift either way. Returns the time step
 * the code belongs to so the caller can refuse to accept the same step twice.
 */
export function verifyTotp(secret: string, code: string, now: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = build(secret, "").validate({ token: code, timestamp: now, window: 1 });
  if (delta === null) return null;
  return Math.floor(now / 1000 / PERIOD_SEC) + delta;
}

export function currentTotp(secret: string, now: number): string {
  return build(secret, "").generate({ timestamp: now });
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function recoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, "");
}

export function hashRecoveryCode(code: string): Promise<string> {
  return sha256Hex(`recovery:${normalizeRecoveryCode(code)}`);
}

export async function generateRecoveryCodes(): Promise<{
  codes: string[];
  records: { id: string; codeHash: string }[];
}> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
  const records = await Promise.all(
    codes.map(async (code) => ({ id: randomToken(16), codeHash: await hashRecoveryCode(code) })),
  );
  return { codes, records };
}
