import { z } from "zod";
import { api, body } from "@/server/api";
import { createCheckout } from "@/server/billing";

export const POST = api({ rateLimit: { name: "checkout", limit: 20, windowSec: 3600 } }, async ({ req, user }) =>
  createCheckout(user, (await body(req, z.object({ planId: z.string() }))).planId),
);
