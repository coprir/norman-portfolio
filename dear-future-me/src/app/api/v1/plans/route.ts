import { api } from "@/server/api";
import { billingEnabled, priceIdFor } from "@/server/billing";
import { db } from "@/server/db";

export const GET = api({ auth: "none" }, async () => {
  const plans = await db.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } });
  return {
    billingEnabled: billingEnabled(),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceCentsMonthly: p.priceCentsMonthly,
      currency: p.currency,
      highlights: p.highlights,
      storageLimitBytes: Number(p.storageLimitBytes),
      purchasable: billingEnabled() && Boolean(priceIdFor(p)),
    })),
  };
});
