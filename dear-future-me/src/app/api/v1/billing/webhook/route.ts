import { api } from "@/server/api";
import { handleStripeEvent } from "@/server/billing";
import { badRequest } from "@/server/errors";

/** Stripe calls this directly; it is authenticated by its signature, not a session. */
export const POST = api({ auth: "none", skipOriginCheck: true }, async ({ req }) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw badRequest("Missing signature.");
  try {
    await handleStripeEvent(await req.text(), signature);
  } catch (err) {
    if ((err as { type?: string }).type === "StripeSignatureVerificationError") throw badRequest("Invalid signature.");
    throw err;
  }
  return { received: true };
});
