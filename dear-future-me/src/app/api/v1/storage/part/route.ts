import { NextRequest, NextResponse } from "next/server";
import { env } from "@/server/env";
import { PART_SIZE, storage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";
import { verifyParams } from "@/server/storage/signing";

/**
 * Local-driver upload target, the stand-in for an S3 presigned UploadPart URL.
 * The signature is the authorization: it is only issued to the upload's owner.
 */
export async function PUT(req: NextRequest) {
  if (env.storageDriver !== "local") return new NextResponse(null, { status: 404 });
  const p = verifyParams(req.nextUrl.searchParams);
  if (!p?.u || !p.n) return NextResponse.json({ error: { code: "forbidden", message: "Upload link is invalid or has expired." } }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > PART_SIZE + 1024) return new NextResponse(null, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > PART_SIZE + 1024) return new NextResponse(null, { status: 413 });
  try {
    const etag = await (storage() as LocalStorage).writePart(p.u, Number(p.n), data);
    return new NextResponse(null, { status: 200, headers: { ETag: `"${etag}"` } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
