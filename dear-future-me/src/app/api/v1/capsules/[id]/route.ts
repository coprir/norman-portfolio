import { api, body } from "@/server/api";
import { deleteDraft, draftPatchSchema, getCapsule, getDraftDetail, updateDraft } from "@/server/capsules/service";

type P = { id: string };

/** Capsule summary. Add ?draft=1 for the creator's editable draft. */
export const GET = api<P>({}, async ({ req, user, params }) =>
  req.nextUrl.searchParams.get("draft") === "1" ? getDraftDetail(user, params.id) : getCapsule(user, params.id),
);

export const PATCH = api<P>({}, async ({ req, user, params }) => updateDraft(user, params.id, await body(req, draftPatchSchema)));

export const DELETE = api<P>({}, async ({ user, params }) => {
  await deleteDraft(user, params.id);
  return { ok: true };
});
