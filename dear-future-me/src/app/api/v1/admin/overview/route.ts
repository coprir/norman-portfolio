import { adminOverview } from "@/server/admin";
import { api } from "@/server/api";

export const GET = api({ auth: "admin" }, async () => adminOverview());
