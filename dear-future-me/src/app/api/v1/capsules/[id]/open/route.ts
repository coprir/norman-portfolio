import { api } from "@/server/api";
import { openCapsule } from "@/server/capsules/service";

export const POST = api<{ id: string }>({}, async ({ user, params, ip }) => openCapsule(user, params.id, ip));
