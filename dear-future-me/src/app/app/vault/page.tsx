import { Vault } from "@/components/vault/vault";
import { aiConfigured } from "@/server/ai";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { listMemories } from "@/server/memories";
import { getUsage } from "@/server/plans";

export const metadata = { title: "Memory Vault" };

export default async function VaultPage() {
  const user = await requireUser();
  const [initial, categories, albums, usage] = await Promise.all([
    listMemories(user.id, {}),
    db.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: [{ userId: { sort: "asc", nulls: "first" } }, { name: "asc" }] }),
    db.album.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { memories: true } } } }),
    getUsage(user.id),
  ]);
  const ai = aiConfigured() && user.aiConsent;
  return (
    <Vault
      initial={initial}
      categories={categories.map((c) => ({ id: c.id, name: c.name, custom: c.userId != null }))}
      albums={albums.map((a) => ({ id: a.id, name: a.name, description: a.description, count: a._count.memories }))}
      storage={{ usedBytes: Number(usage.used), limitBytes: Number(usage.plan.storageLimitBytes) }}
      ai={{ suggest: ai, search: ai && Boolean(usage.features.aiDiscovery) }}
    />
  );
}
