import fs from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import type { EmailContent } from "./templates";

let resend: Resend | null = null;

/**
 * Sends a transactional email through Resend. Without RESEND_API_KEY (local
 * development) the message is written to .data/outbox instead, so flows such
 * as email verification stay usable. Throws on provider failure so callers
 * that need at-least-once delivery can retry.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const key = env.resendKey;
  try {
    let providerId: string | null = null;
    if (key) {
      resend ??= new Resend(key);
      const { data, error } = await resend.emails.send({
        from: env.emailFrom,
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (error) throw new Error(`${error.name}: ${error.message}`);
      providerId = data?.id ?? null;
    } else {
      if (env.isProd && process.env.DFM_ALLOW_OUTBOX !== "1") {
        throw new Error("RESEND_API_KEY is not configured; refusing to drop email in production.");
      }
      const dir = path.resolve(".data/outbox");
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = path.join(dir, `${stamp}-${content.template}-${to.replace(/[^a-z0-9@._-]/gi, "_")}`);
      await fs.writeFile(`${file}.html`, content.html);
      await fs.writeFile(`${file}.txt`, `To: ${to}\nSubject: ${content.subject}\n\n${content.text}\n`);
      providerId = "outbox";
      logger.info({ to, template: content.template, file: `${file}.txt` }, "email written to local outbox");
    }
    await db.emailLog.create({ data: { toEmail: to, template: content.template, subject: content.subject, status: "SENT", providerId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ to, template: content.template, err: message }, "email delivery failed");
    await db.emailLog
      .create({ data: { toEmail: to, template: content.template, subject: content.subject, status: "FAILED", error: message.slice(0, 500) } })
      .catch(() => {});
    throw err;
  }
}

/** For emails where failure must not break the user's action. */
export async function sendEmailSafe(to: string, content: EmailContent): Promise<boolean> {
  try {
    await sendEmail(to, content);
    return true;
  } catch {
    return false;
  }
}
