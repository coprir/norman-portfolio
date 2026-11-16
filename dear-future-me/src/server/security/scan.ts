import type { ScanStatus } from "@prisma/client";

/**
 * Malware-scanning seam. Every completed upload passes through `scanObject`
 * before it is marked READY. The default implementation performs no scan and
 * records NOT_SCANNED; to enable scanning, implement a scanner here (for
 * example ClamAV over clamd's INSTREAM protocol, or a storage-side scanner
 * that reports by webhook) and return CLEAN / INFECTED. INFECTED objects are
 * deleted and the memory is REJECTED by the caller.
 */
export async function scanObject(_key: string, _size: number): Promise<ScanStatus> {
  return "NOT_SCANNED";
}
