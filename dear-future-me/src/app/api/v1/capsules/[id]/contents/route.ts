import { api } from "@/server/api";
import { getContents } from "@/server/capsules/service";

export const GET = api<{ id: string }>({}, async ({ user, params }) => getContents(user, params.id));
