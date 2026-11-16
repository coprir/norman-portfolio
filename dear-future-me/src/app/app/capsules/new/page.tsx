import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { createDraft } from "@/server/capsules/service";

export default async function NewCapsulePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireUser();
  const { kind } = await searchParams;
  const { id } = await createDraft(user, { kind: kind === "future-self" ? "FUTURE_SELF" : "STANDARD" });
  redirect(`/app/capsules/${id}/edit`);
}
