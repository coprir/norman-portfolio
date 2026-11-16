import { api } from "@/server/api";
import { acceptInviteToken } from "@/server/capsules/service";

export const POST = api<{ token: string }>({ rateLimit: { name: "invite-accept", limit: 30, windowSec: 600 } }, async ({ user, params }) =>
  acceptInviteToken(user, params.token),
);
