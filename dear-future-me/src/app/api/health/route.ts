import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { redis } from "@/server/redis";
import { storage } from "@/server/storage";

export const dynamic = "force-dynamic";

async function check(fn: () => Promise<unknown>): Promise<"ok" | "down"> {
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
    return "ok";
  } catch {
    return "down";
  }
}

/** Liveness and dependency health for uptime monitors. Exposes no data. */
export async function GET() {
  const [database, queue, objectStorage, heartbeat] = await Promise.all([
    check(() => db.$queryRaw`SELECT 1`),
    check(() => redis().ping()),
    check(() => storage().ping()),
    redis().get("dfm:worker:heartbeat").catch(() => null),
  ]);
  const worker = heartbeat && Date.now() - new Date(heartbeat).getTime() < 120_000 ? "ok" : "down";
  const healthy = database === "ok" && queue === "ok" && objectStorage === "ok";
  return NextResponse.json(
    { status: healthy ? (worker === "ok" ? "ok" : "degraded") : "down", checks: { database, queue, storage: objectStorage, worker } },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
