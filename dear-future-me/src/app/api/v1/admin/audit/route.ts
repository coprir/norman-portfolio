import { adminAudit } from "@/server/admin";
import { api } from "@/server/api";

export const GET = api({ auth: "admin" }, async ({ req }) => ({ logs: await adminAudit(req.nextUrl.searchParams.get("action") ?? undefined) }));
