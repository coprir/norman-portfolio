import { api } from "@/server/api";
import { badRequest } from "@/server/errors";
import { retryJob } from "@/server/release/processor";

/** Re-runs a failed release or reminder. It cannot open a capsule early: the job still refuses to run before unlock_at. */
export const POST = api<{ id: string }>({ auth: "admin" }, async ({ user, params }) => {
  if (!(await retryJob(params.id, user.id))) throw badRequest("Only failed jobs can be retried.");
  return { ok: true };
});
