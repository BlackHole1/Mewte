import type { ErrorCode } from "@mewte/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An expected failure that maps to a JSON error response. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly headers: Record<string, string>;

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message: string,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in to continue");
export const notFound = (what: string) => new ApiError(404, "not_found", `${what} was not found`);
