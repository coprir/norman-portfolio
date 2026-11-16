import { z } from "zod";
import { api, body } from "@/server/api";
import { initUpload } from "@/server/memories";

const schema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(120),
  size: z.number().int().positive().max(20 * 1024 ** 3),
  inVault: z.boolean().default(true),
  captureDate: z.string().nullable().optional(),
});

/** Starts a resumable, multipart upload and reserves quota for it. */
export const POST = api({ rateLimit: { name: "upload-init", limit: 300, windowSec: 3600 } }, async ({ req, user }) =>
  initUpload(user, await body(req, schema)),
);
