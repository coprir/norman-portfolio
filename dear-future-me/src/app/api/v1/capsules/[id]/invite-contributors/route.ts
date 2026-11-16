import { api } from "@/server/api";
import { inviteContributors } from "@/server/capsules/service";

export const POST = api<{ id: string }>({ rateLimit: { name: "invite", limit: 30, windowSec: 3600 } }, async ({ user, params }) =>
  inviteContributors(user, params.id),
);
