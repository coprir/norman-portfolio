import { Settings } from "@/components/settings";
import { getProfile } from "@/server/account";
import { aiConfigured } from "@/server/ai";
import { requireUser } from "@/server/auth/session";
import { billingEnabled, priceIdFor } from "@/server/billing";
import { db } from "@/server/db";
import { ALWAYS_EMAILED, NOTIFICATION_LABELS } from "@/server/notifications";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, plans, sub] = await Promise.all([getProfile(user), db.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }), db.subscription.findUnique({ where: { userId: user.id } })]);
  return (
    <Settings
      profile={profile}
      billingEnabled={billingEnabled()}
      hasBilling={billingEnabled() && Boolean(sub?.billingReference)}
      aiAvailable={aiConfigured()}
      plans={plans.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCentsMonthly: p.priceCentsMonthly, currency: p.currency, highlights: p.highlights as string[], purchasable: billingEnabled() && Boolean(priceIdFor(p)) }))}
      notificationTypes={(Object.keys(NOTIFICATION_LABELS) as (keyof typeof NOTIFICATION_LABELS)[]).map((type) => ({ type, label: NOTIFICATION_LABELS[type], locked: ALWAYS_EMAILED.includes(type), defaultOn: type !== "CAPSULE_CREATED" }))}
    />
  );
}
