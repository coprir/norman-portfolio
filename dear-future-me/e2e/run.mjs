// End-to-end journey against a running app + worker (see README → Testing).
//   BASE_URL=http://localhost:3000 node e2e/run.mjs
// Registers a new user, verifies the email from the local outbox, uploads a
// photo, seals a capsule due in ~2 minutes, proves it can't be opened early,
// waits for the worker to release it, and opens it.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(path.join(process.env.NODE_PATH ?? "/opt/node22/lib/node_modules", "playwright")));
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("e2e/artifacts");
const OUTBOX = path.resolve(".data/outbox");
fs.mkdirSync(OUT, { recursive: true });

const email = `e2e-${Date.now()}@example.test`;
const password = "correct horse battery";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const step = (m) => console.log(`\n▸ ${m}`);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };
const pad = (n) => String(n).padStart(2, "0");

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, timezoneId: "Europe/London" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const apiGet = (p) => page.request.get(`${BASE}/api/v1${p}`);

try {
  step("Register");
  await page.goto(`${BASE}/register`);
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/app");
  assert(await page.getByText("Confirm your email address").isVisible(), "signed in, asked to confirm email");

  step("Sealing is refused before the email is verified");
  const draft0 = await (await page.request.post(`${BASE}/api/v1/capsules`, { data: { kind: "STANDARD" }, headers: { origin: BASE } })).json();
  const early = await page.request.post(`${BASE}/api/v1/capsules/${draft0.id}/seal`, { data: { declaration: true }, headers: { origin: BASE } });
  assert(early.status() === 403, "unverified account cannot seal (403)");

  step("Verify email from the outbox");
  const mail = fs.readdirSync(OUTBOX).filter((f) => f.includes("verify-email") && f.includes(email) && f.endsWith(".txt")).sort().pop();
  const token = /verify-email\?token=([\w-]+)/.exec(fs.readFileSync(path.join(OUTBOX, mail), "utf8"))[1];
  await page.goto(`${BASE}/verify-email?token=${token}`);
  await page.getByRole("heading", { name: "Email confirmed." }).waitFor();
  assert(true, "email confirmed");

  step("Upload a photograph to the vault");
  await page.goto(`${BASE}/app/vault`);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByLabel("Choose files to upload").setInputFiles({ name: "first-day.png", mimeType: "image/png", buffer: PNG });
  await page.getByText("Saved").waitFor({ timeout: 20000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "first-day" }).first().waitFor();
  assert(true, "photo uploaded and shown in the vault");
  await shot("01-vault");

  step("Create a capsule");
  await page.goto(`${BASE}/app/capsules/${draft0.id}/edit`);
  await page.getByRole("button", { name: "From vault" }).click();
  await page.getByRole("button", { name: /^first-day/ }).last().click();
  await page.getByRole("button", { name: "Add to capsule" }).click();
  await page.getByLabel(/personal message/i).fill("Dear future me — the secret is that you were braver than you felt.");
  await shot("02-wizard-memories");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Title").fill("The first day");
  await page.getByRole("button", { name: /^first-day/ }).click(); // cover
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Who is it for?" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "When should it open?" }).waitFor();

  // An exact time about two minutes out (the minimum lead is one minute).
  const target = new Date(Math.ceil((Date.now() + 100_000) / 60_000) * 60_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(target).map((p) => [p.type, p.value]));
  await page.getByLabel("Exact date and time").fill(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
  await page.getByText(/at \d\d:\d\d/).first().waitFor();
  await shot("03-wizard-date");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Look at everything once more." }).waitFor();
  await shot("04-wizard-preview");
  await page.getByRole("button", { name: "Continue to sealing" }).click();
  await page.getByRole("heading", { name: "Seal this capsule?" }).waitFor();
  const sealBtn = page.getByRole("button", { name: "Seal capsule" });
  assert(await sealBtn.isDisabled(), "seal button is disabled until the declaration is accepted");
  for (const box of await page.getByRole("checkbox").all()) await box.check({ force: true });
  await shot("05-wizard-seal");

  step("Seal");
  await sealBtn.click();
  await page.waitForURL(`**/app/capsules/${draft0.id}?sealed=1`, { timeout: 60000 });
  await page.getByText("This capsule is sealed.").waitFor();
  await shot("06-sealed");
  const sealed = await (await apiGet(`/capsules/${draft0.id}`)).json();
  assert(sealed.status === "LOCKED" && sealed.canViewContents === false, "capsule is LOCKED and unreadable");

  step("Nothing can get inside early");
  assert((await apiGet(`/capsules/${draft0.id}/contents`)).status() === 403, "contents API refuses (403)");
  assert((await page.request.post(`${BASE}/api/v1/capsules/${draft0.id}/open`, { headers: { origin: BASE } })).status() === 403, "open API refuses (403)");
  assert((await page.request.patch(`${BASE}/api/v1/capsules/${draft0.id}`, { data: { title: "x" }, headers: { origin: BASE } })).status() === 409, "edit refused (409)");
  assert((await page.request.delete(`${BASE}/api/v1/capsules/${draft0.id}`, { headers: { origin: BASE } })).status() === 409, "delete refused (409)");
  const vault = await (await apiGet("/memories")).json();
  assert(vault.total === 0, "sealed photo is gone from the vault");
  assert(!JSON.stringify(sealed).includes("braver"), "summary leaks none of the message");
  await page.goto(`${BASE}/app/capsules/${draft0.id}/open`);
  await page.waitForURL(`**/app/capsules/${draft0.id}`);
  assert(true, "reveal page redirects away while sealed");
  const cross = await page.request.post(`${BASE}/api/v1/capsules`, { data: { kind: "STANDARD" }, headers: { origin: "https://evil.example" } });
  assert(cross.status() === 403, "cross-site POST is blocked (403)");

  step("A second account cannot see the capsule at all");
  const other = await browser.newContext();
  const op = await other.newPage();
  const otherEmail = `mallory-${Date.now()}@example.test`;
  const reg = await op.request.post(`${BASE}/api/v1/auth/register`, { data: { name: "Mallory", email: otherEmail, password, timezone: "UTC" }, headers: { origin: BASE } });
  assert(reg.ok(), "second account registered");
  await op.goto(`${BASE}/login`);
  await op.getByLabel("Email").fill(otherEmail);
  await op.getByLabel("Password").fill(password);
  await op.getByRole("button", { name: "Sign in" }).click();
  await op.waitForURL("**/app");
  assert((await op.request.get(`${BASE}/api/v1/capsules/${draft0.id}`)).status() === 404, "stranger gets 404 for the capsule");
  assert((await op.request.get(`${BASE}/api/v1/admin/overview`)).status() === 403, "ordinary user is refused the admin API");
  assert((await op.goto(`${BASE}/admin`)).status() === 404, "admin page is a 404 for ordinary users");
  await other.close();
  const anon = await browser.newContext();
  assert((await anon.request.get(`${BASE}/api/v1/capsules/${draft0.id}`)).status() === 401, "signed-out request gets 401");
  await anon.close();

  step(`Wait for the worker to release it (due ${target.toISOString()})`);
  await page.goto(`${BASE}/app/capsules/${draft0.id}`);
  let status = "LOCKED";
  const deadline = target.getTime() + 60_000;
  while (Date.now() < deadline) {
    status = (await (await apiGet(`/capsules/${draft0.id}`)).json()).status;
    if (status !== "LOCKED") break;
    await page.waitForTimeout(2000);
  }
  assert(status === "AVAILABLE", `released automatically (${Math.round((Date.now() - target.getTime()) / 1000)}s after its time)`);
  const unlockMail = fs.readdirSync(OUTBOX).filter((f) => f.includes("capsule-unlocked") && f.includes(email) && f.endsWith(".txt"));
  assert(unlockMail.length === 1, "exactly one unlock email was sent");
  assert(fs.readFileSync(path.join(OUTBOX, unlockMail[0]), "utf8").includes("A message from your past is waiting."), "unlock email has the right subject");

  step("Open it");
  await page.getByRole("link", { name: "Open your capsule" }).click({ timeout: 20000 });
  await page.getByRole("button", { name: "Open your capsule" }).waitFor();
  await page.waitForTimeout(2500);
  await shot("07-reveal-intro");
  await page.getByRole("button", { name: "Open your capsule" }).click();
  await page.getByText("braver than you felt").waitFor({ timeout: 15000 });
  await shot("08-reveal-message");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("img", { name: "first-day" }).waitFor({ timeout: 15000 });
  assert(true, "message and photograph are revealed");
  await shot("09-reveal-photo");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("heading", { name: "That was you." }).waitFor();
  await shot("10-reveal-end");
  const contents = await (await apiGet(`/capsules/${draft0.id}/contents`)).json();
  const { url } = await (await apiGet(`/capsules/${draft0.id}/items/${contents.items[0].id}/url`)).json();
  const file = await page.request.get(new URL(url, BASE).toString());
  assert(file.ok() && Buffer.compare(await file.body(), PNG) === 0, "restored file is byte-identical to the upload");
  const tampered = await page.request.get(new URL(url.replace(/exp=\d+/, "exp=9999999999"), BASE).toString());
  assert(tampered.status() === 403, "altering a signed link invalidates it (403)");

  step("Export and delete the account");
  const exported = await (await apiGet("/me/export")).json();
  assert(exported.capsules.length === 1 && exported.profile.email === email, "data export contains the account's data");
  const del = await page.request.delete(`${BASE}/api/v1/me`, { data: { password }, headers: { origin: BASE } });
  assert(del.ok(), "account deleted");
  assert((await apiGet("/me")).status() === 401, "session no longer valid after deletion");

  assert(errors.length === 0, `no uncaught page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  console.log("\nAll end-to-end checks passed.");
} catch (err) {
  await shot("failure").catch(() => {});
  console.error(`\n✗ ${err.message}`);
  console.error(`  at ${page.url()}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
