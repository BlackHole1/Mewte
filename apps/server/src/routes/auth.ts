import { createRoute } from "@hono/zod-openapi";
import {
  countUnusedRecoveryCodes,
  createOwner,
  deleteTotp,
  deleteUserSessions,
  enableTotp,
  getOwner,
  getTotp,
  replaceRecoveryCodes,
  savePendingTotp,
  updatePasswordHash,
} from "@mewte/db";
import {
  type Status,
  changePasswordInputSchema,
  loginInputSchema,
  okSchema,
  passwordConfirmInputSchema,
  recoveryCodesSchema,
  setupInputSchema,
  statusSchema,
  totpEnableInputSchema,
  totpSetupSchema,
} from "@mewte/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { ApiError } from "../errors";
import {
  guardCredentials,
  confirmPassword,
  currentSession,
  endSession,
  login,
  startSession,
} from "../services/auth";
import { timingSafeEqual } from "../services/crypto";
import { generateRecoveryCodes, generateTotpSecret, verifyTotp } from "../services/totp";
import { createRouter, json, jsonBody, pick, sessionSecurity } from "./helpers";

const StatusSchema = statusSchema.openapi("Status");
const OkSchema = okSchema.openapi("Ok");
const RecoveryCodesSchema = recoveryCodesSchema.openapi("RecoveryCodes");
const TotpStatusSchema = z
  .object({ enabled: z.boolean(), recoveryCodesLeft: z.number().int() })
  .openapi("TotpStatus");

const ok = { ok: true } as const;

export function authRoutes(deps: Deps) {
  const app = createRouter();

  async function status(user: { id: string; username: string } | undefined): Promise<Status> {
    const owner = user ?? (await getOwner(deps.conn));
    const totp = user ? await getTotp(deps.conn, user.id) : undefined;
    return {
      initialized: owner !== undefined,
      setupTokenRequired: deps.config.setupToken !== undefined,
      user: user ? { username: user.username, totpEnabled: totp?.enabled === 1 } : null,
    };
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/status",
      tags: ["Auth"],
      summary: "Get setup and session status",
      description:
        "Public. Tells the client whether the instance still needs its first-run setup and who, if anyone, is signed in.",
      responses: { 200: json(StatusSchema, "Current status.") },
    }),
    async (c) => c.json(await status((await currentSession(deps, c))?.user), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/setup",
      tags: ["Auth"],
      summary: "Create the owner account",
      description:
        "Public, and only works while no owner exists. If the server was started with SETUP_TOKEN, the same value must be supplied. Signs the new owner in.",
      request: { body: jsonBody(setupInputSchema.openapi("SetupInput")) },
      responses: {
        200: json(StatusSchema, "The owner was created and signed in."),
        ...pick(400, 403, 409, 429),
      },
    }),
    async (c) => {
      const input = c.req.valid("json");
      await guardCredentials(deps, c, undefined, async (reject) => {
        if (await getOwner(deps.conn)) {
          throw new ApiError(409, "already_initialized", "Mewte has already been set up");
        }
        const expected = deps.config.setupToken;
        if (expected !== undefined && !(await timingSafeEqual(input.setupToken ?? "", expected))) {
          await reject(new ApiError(403, "setup_token_invalid", "The setup token is incorrect"));
        }
      });
      const created = await createOwner(deps.conn, {
        username: input.username,
        passwordHash: await deps.hasher.hash(input.password),
        now: deps.now(),
      });
      if (!created) {
        throw new ApiError(409, "already_initialized", "Mewte has already been set up");
      }
      const owner = (await getOwner(deps.conn))!;
      await startSession(deps, c, owner.id);
      return c.json(await status(owner), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/login",
      tags: ["Auth"],
      summary: "Sign in",
      description:
        "Public. Sets an HttpOnly session cookie. When two-factor authentication is on and `code` is missing, the response is 401 with the code `totp_required`; resend the request with a TOTP code or a recovery code. A wrong username, password or code is answered after a delay of a few seconds that grows with repeated failures. Failed attempts are limited per client (address plus browser), per address and per account; once a limit is reached the response is 429 with a `Retry-After` header.",
      request: { body: jsonBody(loginInputSchema.openapi("LoginInput")) },
      responses: {
        200: json(StatusSchema, "Signed in."),
        ...pick(400, 401, 409, 429),
      },
    }),
    async (c) => {
      const owner = await login(deps, c, c.req.valid("json"));
      return c.json(await status(owner), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/logout",
      tags: ["Auth"],
      summary: "Sign out",
      description:
        "Deletes the current session and clears the cookie. Succeeds even when not signed in.",
      responses: { 200: json(OkSchema, "Signed out.") },
    }),
    async (c) => {
      await endSession(deps, c);
      return c.json(ok, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/password",
      tags: ["Auth"],
      summary: "Change the password",
      description: "Requires the current password. Every other session is signed out.",
      security: sessionSecurity,
      request: { body: jsonBody(changePasswordInputSchema.openapi("ChangePasswordInput")) },
      responses: { 200: json(OkSchema, "Password changed."), ...pick(400, 401, 403, 429) },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const user = c.get("user");
      await confirmPassword(deps, c, user, input.currentPassword);
      await updatePasswordHash(deps.conn, await deps.hasher.hash(input.newPassword), deps.now());
      await deleteUserSessions(deps.conn, user.id, c.get("session").id);
      return c.json(ok, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/auth/totp",
      tags: ["Two-factor authentication"],
      summary: "Get two-factor status",
      security: sessionSecurity,
      responses: { 200: json(TotpStatusSchema, "Two-factor status."), ...pick(401) },
    }),
    async (c) => {
      const user = c.get("user");
      const totp = await getTotp(deps.conn, user.id);
      const enabled = totp?.enabled === 1;
      return c.json(
        {
          enabled,
          recoveryCodesLeft: enabled ? await countUnusedRecoveryCodes(deps.conn, user.id) : 0,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/totp/setup",
      tags: ["Two-factor authentication"],
      summary: "Start two-factor setup",
      description:
        "Generates a new secret and returns it with an otpauth:// URL to show as a QR code. Nothing changes for sign-in until the secret is confirmed with `POST /auth/totp/enable`.",
      security: sessionSecurity,
      responses: {
        200: json(totpSetupSchema.openapi("TotpSetup"), "The pending secret."),
        ...pick(401, 409),
      },
    }),
    async (c) => {
      const user = c.get("user");
      if ((await getTotp(deps.conn, user.id))?.enabled) {
        throw new ApiError(409, "totp_already_enabled", "Two-factor authentication is already on");
      }
      const generated = generateTotpSecret(user.username);
      await savePendingTotp(deps.conn, {
        userId: user.id,
        secretEnc: await deps.cipher.encrypt(generated.secret),
        now: deps.now(),
      });
      return c.json(generated, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/totp/enable",
      tags: ["Two-factor authentication"],
      summary: "Confirm and turn on two-factor authentication",
      description:
        "Verifies one code from the authenticator app against the pending secret, turns two-factor authentication on, and returns one-time recovery codes. The codes are shown only once.",
      security: sessionSecurity,
      request: { body: jsonBody(totpEnableInputSchema.openapi("TotpEnableInput")) },
      responses: {
        200: json(RecoveryCodesSchema, "Two-factor authentication is on."),
        ...pick(400, 401, 409),
      },
    }),
    async (c) => {
      const user = c.get("user");
      const totp = await getTotp(deps.conn, user.id);
      if (!totp) throw new ApiError(409, "totp_not_pending", "Start two-factor setup first");
      if (totp.enabled) {
        throw new ApiError(409, "totp_already_enabled", "Two-factor authentication is already on");
      }
      const secret = await deps.cipher.decrypt(totp.secretEnc);
      const step = verifyTotp(secret, c.req.valid("json").code, deps.now());
      if (step === null) throw new ApiError(400, "totp_invalid", "Incorrect two-factor code");
      const { codes, records } = await generateRecoveryCodes();
      await enableTotp(deps.conn, { userId: user.id, step, recoveryCodes: records });
      return c.json({ recoveryCodes: codes }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/totp/disable",
      tags: ["Two-factor authentication"],
      summary: "Turn off two-factor authentication",
      description: "Requires the password. Deletes the secret and all recovery codes.",
      security: sessionSecurity,
      request: { body: jsonBody(passwordConfirmInputSchema.openapi("PasswordConfirmInput")) },
      responses: {
        200: json(OkSchema, "Two-factor authentication is off."),
        ...pick(400, 401, 403, 429),
      },
    }),
    async (c) => {
      const user = c.get("user");
      await confirmPassword(deps, c, user, c.req.valid("json").password);
      await deleteTotp(deps.conn, user.id);
      return c.json(ok, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/auth/totp/recovery-codes",
      tags: ["Two-factor authentication"],
      summary: "Replace the recovery codes",
      description:
        "Requires the password. Invalidates the old recovery codes and returns new ones.",
      security: sessionSecurity,
      request: { body: jsonBody(passwordConfirmInputSchema) },
      responses: {
        200: json(RecoveryCodesSchema, "The new recovery codes."),
        ...pick(400, 401, 403, 409, 429),
      },
    }),
    async (c) => {
      const user = c.get("user");
      await confirmPassword(deps, c, user, c.req.valid("json").password);
      if (!(await getTotp(deps.conn, user.id))?.enabled) {
        throw new ApiError(409, "totp_not_pending", "Two-factor authentication is not on");
      }
      const { codes, records } = await generateRecoveryCodes();
      await replaceRecoveryCodes(deps.conn, user.id, records);
      return c.json({ recoveryCodes: codes }, 200);
    },
  );

  return app;
}
