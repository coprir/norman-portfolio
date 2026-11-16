import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/server/env";
import { storage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { verifyParams } from "@/server/storage/signing";

/**
 * Local-driver read target, the stand-in for an S3 presigned GET URL.
 * Nothing is served without a valid, unexpired signature. Supports Range so
 * video can seek.
 */
export async function GET(req: NextRequest) {
  if (env.storageDriver !== "local") return new NextResponse(null, { status: 404 });
  const p = verifyParams(req.nextUrl.searchParams);
  if (!p?.k) return NextResponse.json({ error: { code: "forbidden", message: "This link is invalid or has expired." } }, { status: 403 });
  let file: string;
  try {
    file = (storage() as LocalStorage).objectPath(p.k);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const st = await fs.stat(file).catch(() => null);
  if (!st) return new NextResponse(null, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": p.ct || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    // Uploaded files are never allowed to run script in our origin.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (p.dn) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(p.dn)}`;

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (start > end || start >= st.size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    start = Math.max(0, start);
    return new NextResponse(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(st.size) } });
}
