import Stripe from "stripe";
import { audit } from "./audit";
import type { SessionUser } from "./auth/session";
import { db } from "./db";
import { env } from "./env";
import { badRequest, unavailable } from "./errors";
import { logger } from "./logger";
import { DEFAULT_PLAN_ID, ensureSubscription } from "./plans";

let client: Stripe | null = null;
export const billingEnabled = () => Boolean(env.stripeKey);

function stripe(): Stripe {
  if (!env.stripeKey) throw unavailable("Paid plans aren't available yet.");
  client ??= new Stripe(env.stripeKey);
  return client;
}

/** A plan can be bought when Stripe is configured and its price id is set. */
export function priceIdFor(plan: { stripePriceEnv: string | null }): string | null {
  return plan.stripePriceEnv ? process.env[plan.stripePriceEnv] || null : null;
}

export async function createCheckout(user: SessionUser, planId: string): Promise<{ url: string }> {
  const plan = await db.plan.findUnique({ where: { id: planId } });
  const price = plan && priceIdFor(plan);
  if (!plan || !price) throw badRequest("That plan can't be purchased.");
  const sub = await ensureSubscription(user.id);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: sub.billingReference ?? undefined,
    customer_email: sub.billingReference ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    success_url: `${env.appUrl}/app/settings?billing=success#plan`,
    cancel_url: `${env.appUrl}/app/settings?billing=cancelled#plan`,
  });
  if (!session.url) throw unavailable("Checkout couldn't be started. Please try again.");
  return { url: session.url };
}

export async function createPortal(user: SessionUser): Promise<{ url: string }> {
  const sub = await ensureSubscription(user.id);
  if (!sub.billingReference) throw badRequest("You don't have a paid subscription to manage.");
  const session = await stripe().billingPortal.sessions.create({ customer: sub.billingReference, return_url: `${env.appUrl}/app/settings#plan` });
  return { url: session.url };
}

/**
 * Applies a verified Stripe event. When a subscription ends the user returns
 * to the Free plan: nothing is deleted and locked capsules still open on
 * time, but new uploads are blocked while they are over the Free limits.
 */
export async function handleStripeEvent(rawBody: string, signature: string) {
  if (!env.stripeWebhookSecret) throw unavailable("Billing webhooks aren't configured.");
  const event = stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const userId = s.metadata?.userId;
      const planId = s.metadata?.planId;
      if (!userId || !planId) break;
      await db.subscription.upsert({
        where: { userId },
        update: { planId, status: "ACTIVE", billingReference: String(s.customer), externalId: s.subscription ? String(s.subscription) : null },
        create: { userId, planId, status: "ACTIVE", billingReference: String(s.customer), externalId: s.subscription ? String(s.subscription) : null },
      });
      await audit({ userId, action: "billing.subscribed", metadata: { planId } });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const s = event.data.object;
      const row = await db.subscription.findUnique({ where: { externalId: s.id } });
      if (!row) break;
      const ended = event.type === "customer.subscription.deleted" || s.status === "canceled" || s.status === "unpaid";
      await db.subscription.update({
        where: { id: row.id },
        data: ended
          ? { planId: DEFAULT_PLAN_ID, status: "ACTIVE", externalId: null, currentPeriodEnd: null }
          : { status: s.status === "past_due" ? "PAST_DUE" : "ACTIVE", planId: (s.metadata?.planId as string) || row.planId },
      });
      await audit({ userId: row.userId, action: ended ? "billing.ended" : "billing.updated", metadata: { status: s.status } });
      break;
    }
    default:
      logger.debug({ type: event.type }, "ignored stripe event");
  }
}
