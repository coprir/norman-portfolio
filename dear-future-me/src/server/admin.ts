import { db } from "./db";
import { redis } from "./redis";
import { storage } from "./storage";

const DAY = 86_400_000;

async function probe(fn: () => Promise<unknown>): Promise<"ok" | "down"> {
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
    return "ok";
  } catch {
    return "down";
  }
}

/**
 * Operational overview for administrators. Aggregates and job state only:
 * no capsule titles, messages, media or file names leave this function, and
 * nothing in the admin surface can issue a media URL.
 */
export async function adminOverview() {
  const now = Date.now();
  const [users, verified, active7, new7, new30, memories, vaultBytes, sealedBytes, capsulesByStatus, subs, upcoming, jobsByStatus, emails, heartbeat, database, queue, objectStorage] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { emailVerifiedAt: { not: null } } }),
    db.user.count({ where: { lastActiveAt: { gte: new Date(now - 7 * DAY) } } }),
    db.user.count({ where: { createdAt: { gte: new Date(now - 7 * DAY) } } }),
    db.user.count({ where: { createdAt: { gte: new Date(now - 30 * DAY) } } }),
    db.memory.count({ where: { status: "READY" } }),
    db.memory.aggregate({ _sum: { fileSize: true } }),
    db.capsule.aggregate({ _sum: { sealedBytes: true } }),
    db.capsule.groupBy({ by: ["status"], _count: true }),
    db.subscription.groupBy({ by: ["planId", "status"], _count: true }),
    db.capsule.findMany({ where: { status: "LOCKED", unlockAt: { lte: new Date(now + 30 * DAY) } }, orderBy: { unlockAt: "asc" }, take: 25, select: { id: true, unlockAt: true, itemCount: true, sealedBytes: true, _count: { select: { recipients: true } } } }),
    db.scheduledJob.groupBy({ by: ["type", "status"], _count: true }),
    db.emailLog.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(now - 7 * DAY) } }, _count: true }),
    redis().get("dfm:worker:heartbeat").catch(() => null),
    probe(() => db.$queryRaw`SELECT 1`),
    probe(() => redis().ping()),
    probe(() => storage().ping()),
  ]);
  return {
    users: { total: users, verified, active7d: active7, new7d: new7, new30d: new30 },
    storage: { memories, vaultBytes: Number(vaultBytes._sum.fileSize ?? 0), sealedBytes: Number(sealedBytes._sum.sealedBytes ?? 0), driver: process.env.STORAGE_DRIVER === "s3" ? "s3" : "local" },
    capsules: Object.fromEntries(capsulesByStatus.map((c) => [c.status, c._count])) as Record<string, number>,
    subscriptions: subs.map((s) => ({ plan: s.planId, status: s.status, count: s._count })),
    upcoming: upcoming.map((c) => ({ id: c.id, unlockAt: c.unlockAt!.toISOString(), items: c.itemCount, bytes: Number(c.sealedBytes), recipients: c._count.recipients })),
    jobs: jobsByStatus.map((j) => ({ type: j.type, status: j.status, count: j._count })),
    emails7d: Object.fromEntries(emails.map((e) => [e.status, e._count])) as Record<string, number>,
    health: { database, queue, storage: objectStorage, worker: heartbeat && now - new Date(heartbeat).getTime() < 120_000 ? "ok" : "down", workerHeartbeat: heartbeat },
  };
}

export async function adminJobs(filter: "problem" | "upcoming" | "all") {
  const where =
    filter === "problem"
      ? { status: { in: ["FAILED" as const, "DEAD" as const] } }
      : filter === "upcoming"
        ? { status: { in: ["PENDING" as const, "QUEUED" as const, "RUNNING" as const] } }
        : {};
  const jobs = await db.scheduledJob.findMany({ where, orderBy: filter === "upcoming" ? { scheduledAt: "asc" } : { updatedAt: "desc" }, take: 100, include: { capsule: { select: { status: true, unlockAt: true, creatorId: true } } } });
  return jobs.map((j) => ({
    id: j.id,
    capsuleId: j.capsuleId,
    capsuleStatus: j.capsule.status,
    creatorId: j.capsule.creatorId,
    type: j.type,
    variant: j.variant,
    status: j.status,
    attempts: j.attempts,
    lastError: j.lastError,
    scheduledAt: j.scheduledAt.toISOString(),
    completedAt: j.completedAt?.toISOString() ?? null,
    updatedAt: j.updatedAt.toISOString(),
  }));
}

export async function adminUsers(q?: string) {
  const users = await db.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { subscription: { select: { planId: true, status: true } }, _count: { select: { memories: true, capsules: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    verified: Boolean(u.emailVerifiedAt),
    plan: u.subscription?.planId ?? "free",
    memories: u._count.memories,
    capsules: u._count.capsules,
    createdAt: u.createdAt.toISOString(),
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
  }));
}

export async function adminAudit(action?: string) {
  const logs = await db.auditLog.findMany({ where: action ? { action: { startsWith: action } } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { email: true } } } });
  return logs.map((l) => ({ id: l.id, at: l.createdAt.toISOString(), action: l.action, user: l.user?.email ?? null, resourceId: l.resourceId, ip: l.ip, metadata: l.metadata }));
}
