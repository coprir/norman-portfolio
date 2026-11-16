import type { Plan } from "@prisma/client";
import { db } from "./db";
import { limitReached } from "./errors";

export const DEFAULT_PLAN_ID = "free";

export type PlanFeatures = {
  videoMessages?: boolean;
  advancedSharing?: boolean;
  aiDiscovery?: boolean;
  familySharing?: boolean;
  enhancedReveal?: boolean;
};

/** Every user has exactly one subscription row; new users start on Free. */
export async function ensureSubscription(userId: string) {
  return db.subscription.upsert({
    where: { userId },
    update: {},
    create: { userId, planId: DEFAULT_PLAN_ID },
  });
}

export async function getPlanForUser(userId: string): Promise<Plan> {
  const sub = await db.subscription.findUnique({ where: { userId }, include: { plan: true } });
  // A lapsed paid plan falls back to Free limits; nothing is deleted.
  if (sub && sub.status === "ACTIVE") return sub.plan;
  const free = await db.plan.findUnique({ where: { id: DEFAULT_PLAN_ID } });
  if (!free) throw new Error("Plans are not seeded. Run `npm run db:seed`.");
  return free;
}

export async function getStorageUsed(userId: string): Promise<bigint> {
  const agg = await db.memory.aggregate({ where: { userId }, _sum: { fileSize: true } });
  return agg._sum.fileSize ?? BigInt(0);
}

export async function getUsage(userId: string) {
  const [plan, used, activeCapsules] = await Promise.all([
    getPlanForUser(userId),
    getStorageUsed(userId),
    db.capsule.count({ where: { creatorId: userId, status: { in: ["LOCKED", "SCHEDULED"] } } }),
  ]);
  return { plan, used, activeCapsules, features: (plan.features ?? {}) as PlanFeatures };
}

export async function assertCanStore(userId: string, sizeBytes: number) {
  const { plan, used } = await getUsage(userId);
  if (BigInt(sizeBytes) > plan.maxFileSizeBytes) {
    throw limitReached(`Files on the ${plan.name} plan can be up to ${formatBytes(Number(plan.maxFileSizeBytes))}.`);
  }
  if (used + BigInt(sizeBytes) > plan.storageLimitBytes) {
    throw limitReached(`This would go over your ${formatBytes(Number(plan.storageLimitBytes))} of storage. Free up space or upgrade your plan.`);
  }
  return { plan, used };
}

export async function assertCanLock(userId: string, recipientCount: number) {
  const { plan, activeCapsules } = await getUsage(userId);
  if (plan.maxActiveCapsules != null && activeCapsules >= plan.maxActiveCapsules) {
    throw limitReached(`The ${plan.name} plan holds ${plan.maxActiveCapsules} locked capsules at a time. Upgrade to lock more.`);
  }
  if (recipientCount > plan.maxRecipients) {
    throw limitReached(`The ${plan.name} plan allows up to ${plan.maxRecipients} recipients per capsule.`);
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
