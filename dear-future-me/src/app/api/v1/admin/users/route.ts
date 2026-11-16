import { adminUsers } from "@/server/admin";
import { api } from "@/server/api";

export const GET = api({ auth: "admin" }, async ({ req }) => ({ users: await adminUsers(req.nextUrl.searchParams.get("q") ?? undefined) }));
