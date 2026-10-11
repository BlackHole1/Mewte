import { OpenAPIHono, type z } from "@hono/zod-openapi";
import type { SessionRecord, UserRecord } from "@mewte/db";
import { apiErrorSchema } from "@mewte/shared";
import { ApiError } from "../errors";

export interface AppEnv {
  Variables: {
    user: UserRecord;
    session: SessionRecord;
  };
}

export const ErrorSchema = apiErrorSchema.openapi("Error");

/** A router whose validation failures use the shared error shape. */
export function createRouter(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (result.success) return;
      const issue = result.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      throw new ApiError(400, "validation_error", `${where}${issue?.message ?? "Invalid request"}`);
    },
  });
}

export const jsonBody = <T extends z.ZodType>(schema: T, description?: string) => ({
  required: true,
  description,
  content: { "application/json": { schema } },
});

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const error = (description: string) => json(ErrorSchema, description);

export const errors = {
  400: error("The request is malformed or failed validation."),
  401: error("No valid session cookie was sent."),
  403: error("The request was understood but refused."),
  404: error("The resource does not exist."),
  409: error("The request conflicts with the current state."),
  429: error("Too many attempts. Retry after the time given in the Retry-After header."),
  502: error("GitHub could not be reached."),
} as const;

export function pick<K extends keyof typeof errors>(...codes: K[]): Pick<typeof errors, K> {
  return Object.fromEntries(codes.map((code) => [code, errors[code]])) as Pick<typeof errors, K>;
}

export const sessionSecurity = [{ sessionCookie: [] }];
