import { api } from "@/server/api";
import { getItemUrl } from "@/server/capsules/service";

/** Short-lived download access to one item of a released capsule. */
export const GET = api<{ id: string; itemId: string }>({ rateLimit: { name: "item-url", limit: 1200, windowSec: 600 } }, async ({ req, user, params }) =>
  getItemUrl(user, params.id, params.itemId, { download: req.nextUrl.searchParams.get("download") === "1" }),
);
