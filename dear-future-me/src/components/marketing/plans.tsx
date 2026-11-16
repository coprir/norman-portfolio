import { Check } from "lucide-react";
import { clsx } from "clsx";
import { LinkButton } from "@/components/ui/button";
import { db } from "@/server/db";

export function formatPrice(cents: number, currency: string) {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/** Plans come from the database, so prices and limits are never baked into the page. */
export async function PlanCards() {
  const plans = await db.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }).catch(() => []);
  if (!plans.length) return <p className="text-silver">Plans are being updated. Creating an account is free.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((p) => {
        const featured = p.id === "personal";
        return (
          <div key={p.id} className={clsx("flex flex-col rounded-3xl border p-6", featured ? "border-blue/50 bg-blue/[0.06]" : "border-line bg-white/[0.02]")}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">{p.name}</h3>
              {featured && <span className="rounded-full bg-blue/20 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-wider text-[#b9c9ff]">Most chosen</span>}
            </div>
            <p className="mt-1 text-sm text-mute">{p.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="font-serif text-4xl">{formatPrice(p.priceCentsMonthly, p.currency)}</span>
              {p.priceCentsMonthly > 0 && <span className="text-sm text-mute">/ month</span>}
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-silver">
              {(p.highlights as string[]).map((h) => (
                <li key={h} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
                  {h}
                </li>
              ))}
            </ul>
            <LinkButton href="/register" variant={featured ? "primary" : "secondary"} className="mt-7 w-full">
              {p.priceCentsMonthly === 0 ? "Start free" : "Start with Free"}
            </LinkButton>
          </div>
        );
      })}
    </div>
  );
}
