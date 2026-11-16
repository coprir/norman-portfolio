import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const GB = BigInt(1024 ** 3);
const MB = BigInt(1024 ** 2);

/**
 * Plans are data. Edit limits and display prices here (or directly in the
 * database); no business logic refers to a specific price.
 */
const plans = [
  {
    id: "free",
    name: "Free",
    description: "Start preserving moments.",
    storageLimitBytes: BigInt(1) * GB,
    maxActiveCapsules: 3,
    maxFileSizeBytes: BigInt(200) * MB,
    maxRecipients: 2,
    priceCentsMonthly: 0,
    features: {},
    highlights: ["1 GB of private storage", "3 locked capsules at a time", "Scheduling up to 20 years ahead", "Timeline and unlock notifications"],
    stripePriceEnv: null,
    sortOrder: 0,
  },
  {
    id: "personal",
    name: "Personal",
    description: "For a life's worth of letters.",
    storageLimitBytes: BigInt(50) * GB,
    maxActiveCapsules: 50,
    maxFileSizeBytes: BigInt(2) * GB,
    maxRecipients: 10,
    priceCentsMonthly: 500,
    features: { videoMessages: true, enhancedReveal: true },
    highlights: ["50 GB of private storage", "50 locked capsules", "Long video messages (2 GB files)", "Albums, tags and custom categories"],
    stripePriceEnv: "STRIPE_PRICE_PERSONAL",
    sortOrder: 1,
  },
  {
    id: "premium",
    name: "Premium",
    description: "Everything, kept for the long run.",
    storageLimitBytes: BigInt(500) * GB,
    maxActiveCapsules: null,
    maxFileSizeBytes: BigInt(10) * GB,
    maxRecipients: 50,
    priceCentsMonthly: 1200,
    features: { videoMessages: true, enhancedReveal: true, advancedSharing: true, aiDiscovery: true },
    highlights: ["500 GB of private storage", "Unlimited locked capsules", "AI memory search and summaries", "Up to 50 recipients per capsule"],
    stripePriceEnv: "STRIPE_PRICE_PREMIUM",
    sortOrder: 2,
  },
  {
    id: "family",
    name: "Family",
    description: "One archive for the people you love.",
    storageLimitBytes: BigInt(1024) * GB,
    maxActiveCapsules: null,
    maxFileSizeBytes: BigInt(10) * GB,
    maxRecipients: 100,
    priceCentsMonthly: 2000,
    features: { videoMessages: true, enhancedReveal: true, advancedSharing: true, aiDiscovery: true, familySharing: true },
    highlights: ["1 TB of shared storage", "Family capsules and milestones", "Everyone can contribute", "Everything in Premium"],
    stripePriceEnv: "STRIPE_PRICE_FAMILY",
    sortOrder: 3,
  },
];

const categories = [
  "Childhood", "Family", "Friends", "Relationships", "Travel", "Education",
  "Career", "Achievements", "Personal growth", "Important life events",
];

async function main() {
  for (const p of plans) {
    await db.plan.upsert({ where: { id: p.id }, create: p, update: p });
  }
  for (const name of categories) {
    const existing = await db.category.findFirst({ where: { userId: null, name } });
    if (!existing) await db.category.create({ data: { name } });
  }
  const superEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  if (superEmail) {
    const res = await db.user.updateMany({ where: { email: superEmail }, data: { role: "SUPER_ADMIN" } });
    console.log(res.count ? `Promoted ${superEmail} to SUPER_ADMIN` : `SUPER_ADMIN_EMAIL not registered yet: ${superEmail}`);
  }
  console.log(`Seeded ${plans.length} plans and ${categories.length} default categories.`);
}

main().finally(() => db.$disconnect());
