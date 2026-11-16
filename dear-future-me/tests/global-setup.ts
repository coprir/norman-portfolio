import { execSync } from "node:child_process";
import fs from "node:fs";

/** Tests run against a real, separate Postgres database and Redis db 1. */
export default function setup() {
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
  const url = (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, "/dfm_test$1"));
  if (!/test/.test(url)) throw new Error("Refusing to run tests against a non-test database");
  // Non-destructive: applies pending migrations to the dedicated test database.
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  fs.rmSync(".data/test-storage", { recursive: true, force: true });
  fs.rmSync(".data/test-outbox", { recursive: true, force: true });
}
