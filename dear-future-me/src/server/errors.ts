export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);
export const unauthorized = (message = "Please sign in.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this.") => new ApiError(403, "forbidden", message);
/** Used for both "missing" and "not yours" so existence is never leaked. */
export const notFound = (message = "Not found.") => new ApiError(404, "not_found", message);
export const conflict = (message: string) => new ApiError(409, "conflict", message);
export const tooMany = (message = "Too many attempts. Please wait a moment and try again.") =>
  new ApiError(429, "rate_limited", message);
export const limitReached = (message: string) => new ApiError(402, "plan_limit", message);
export const unavailable = (message: string) => new ApiError(503, "unavailable", message);
