import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, forbidden } from "./errors";
import { env } from "./env";
import { logger } from "./logger";
import { rateLimit } from "./ratelimit";
import { requireAdmin, requireSuperAdmin, requireUser, type SessionUser } from "./auth/session";

type AuthMode = "none" | "user" | "admin" | "superadmin";

type Options = {
  auth?: AuthMode;
  /** Requests allowed per window, per IP (and per user when signed in). */
  rateLimit?: { name: string; limit: number; windowSec: number };
  /** Skip the same-origin check (only for signed webhooks). */
  skipOriginCheck?: boolean;
};

export type Ctx<P, A extends AuthMode> = {
  req: NextRequest;
  params: P;
  ip: string;
  user: A extends "none" ? null : SessionUser;
};

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * CSRF defence for cookie-authenticated mutations: a browser always sends
 * Origin on cross-site state-changing requests, so it must match our own.
 */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin) {
    const allowed = new Set([new URL(env.appUrl).origin, req.nextUrl.origin]);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) allowed.add(`${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${host}`);
    if (!allowed.has(origin)) throw forbidden("Cross-site request blocked.");
  } else if (site && site !== "same-origin" && site !== "none") {
    throw forbidden("Cross-site request blocked.");
  }
}

export function api<P = Record<string, never>, A extends AuthMode = "user">(
  opts: Options & { auth?: A },
  handler: (ctx: Ctx<P, A>) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, route: { params: Promise<P> }): Promise<Response> => {
    const ip = clientIp(req);
    try {
      if (!opts.skipOriginCheck) assertSameOrigin(req);
      const mode = (opts.auth ?? "user") as AuthMode;
      let user: SessionUser | null = null;
      if (mode === "user") user = await requireUser();
      else if (mode === "admin") user = await requireAdmin();
      else if (mode === "superadmin") user = await requireSuperAdmin();
      if (opts.rateLimit) {
        const who = user ? `u:${user.id}` : `ip:${ip}`;
        await rateLimit(`${opts.rateLimit.name}:${who}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      const result = await handler({ req, params: await route.params, ip, user: user as Ctx<P, A>["user"] });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return NextResponse.json(
          {
            error: {
              code: "validation_error",
              message: first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input.",
              details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          { status: 400 },
        );
      }
      logger.error({ err, path: req.nextUrl.pathname, method: req.method }, "unhandled api error");
      const Sentry = await import("@sentry/nextjs").catch(() => null);
      Sentry?.captureException(err);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } },
        { status: 500 },
      );
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be valid JSON.");
  }
  return schema.parse(json);
}

/** BigInt-safe JSON shaping for DTOs. */
export const num = (v: bigint | number | null | undefined) => (v == null ? 0 : Number(v));
