import { recipientLabel } from "@/components/capsules/capsule-card";
import { TimeMachine, type TimelineEntry } from "@/components/time-machine";
import { requireUser } from "@/server/auth/session";
import { listCapsules } from "@/server/capsules/service";
import { db } from "@/server/db";
import { toMemoryDTO } from "@/server/memories";

export const metadata = { title: "Time Machine" };

export default async function TimeMachinePage() {
  const user = await requireUser();
  const [memories, { created, received }, categories] = await Promise.all([
    db.memory.findMany({ where: { userId: user.id, inVault: true, status: "READY" }, orderBy: { captureDate: "desc" }, take: 600, include: { category: { select: { name: true } } } }),
    listCapsules(user),
    db.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: { name: "asc" } }),
  ]);

  const entries: TimelineEntry[] = [];
  for (const m of memories) {
    const dto = await toMemoryDTO(m);
    entries.push({ id: m.id, kind: "memory", date: (m.captureDate ?? m.uploadedAt).toISOString(), title: m.title || m.originalFilename || "Untitled", note: m.category?.name, thumbUrl: dto.thumbUrl, href: "/app/vault", categoryId: m.categoryId, mediaType: m.mediaType });
  }
  for (const c of [...created, ...received]) {
    if (c.status === "DRAFT" || c.status === "SEALING") continue;
    const base = { id: c.id, title: c.title, note: recipientLabel(c), thumbUrl: c.coverThumbUrl, href: `/app/capsules/${c.id}`, categoryId: c.categoryId };
    // A capsule appears twice: where it was sealed, and where it opens.
    if (c.sealedAt && c.isCreator) entries.push({ ...base, kind: "sealed", date: c.sealedAt });
    if (c.unlockAt) entries.push({ ...base, kind: c.isReleased ? "opened" : "opens", date: c.isReleased ? (c.releasedAt ?? c.unlockAt) : c.unlockAt });
  }
  return <TimeMachine entries={entries} categories={categories.map((c) => ({ id: c.id, name: c.name }))} today={new Date().toISOString()} />;
}
