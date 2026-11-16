import { api } from "@/server/api";
import { getMemoryUrls } from "@/server/memories";

/**
 * Issues a five-minute signed URL for a memory's file — but only after the
 * access gate in `canReadMemory` agrees the caller may read it right now.
 */
export const GET = api<{ id: string }>({ rateLimit: { name: "memory-url", limit: 1200, windowSec: 600 } }, async ({ req, user, params }) =>
  getMemoryUrls(user, params.id, { download: req.nextUrl.searchParams.get("download") === "1" }),
);
