import { notFound, redirect } from "next/navigation";
import { CapsuleWizard } from "@/components/capsules/wizard";
import { aiConfigured } from "@/server/ai";
import { requireUser } from "@/server/auth/session";
import { getDraftDetail } from "@/server/capsules/service";
import { db } from "@/server/db";
import { ApiError } from "@/server/errors";

export const metadata = { title: "New capsule" };

export default async function EditCapsulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  let draft;
  try {
    draft = await getDraftDetail(user, id);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // Not an editable draft: if it's a sealed capsule of theirs, show that instead.
    const exists = await db.capsule.findFirst({ where: { id, creatorId: user.id }, select: { id: true } });
    if (exists) redirect(`/app/capsules/${id}`);
    notFound();
  }
  const categories = await db.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: [{ userId: { sort: "asc", nulls: "first" } }, { name: "asc" }] });
  return (
    <CapsuleWizard
      draft={draft}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      user={{ name: user.name, email: user.email, timezone: user.timezone, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null, emailVerified: user.emailVerified }}
      ai={aiConfigured() && user.aiConsent}
    />
  );
}
