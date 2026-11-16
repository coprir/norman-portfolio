import { afterAll, vi } from "vitest";

process.loadEnvFile(".env");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, "/dfm_test$1");
process.env.REDIS_URL = (process.env.REDIS_URL ?? "redis://localhost:6379").replace(/\/\d+$/, "") + "/1";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = ".data/test-storage";
process.env.LOG_LEVEL = "silent";
delete process.env.RESEND_API_KEY;

// Capture emails instead of sending them; tests can also make delivery fail.
export const outbox: { to: string; template: string; subject: string; text: string }[] = [];
export const emailControl = { failFor: new Set<string>() };

vi.mock("@/server/email/send", () => {
  const sendEmail = async (to: string, content: { template: string; subject: string; text: string }) => {
    if (emailControl.failFor.has(to)) throw new Error(`simulated delivery failure for ${to}`);
    outbox.push({ to, template: content.template, subject: content.subject, text: content.text });
  };
  return { sendEmail, sendEmailSafe: async (to: string, c: never) => sendEmail(to, c).then(() => true, () => false) };
});

afterAll(async () => {
  const { db } = await import("@/server/db");
  await db.$disconnect();
  const { redis } = await import("@/server/redis");
  redis().disconnect();
});
