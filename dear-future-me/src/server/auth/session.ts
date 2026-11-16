import { cache } from "react";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "../db";
import { forbidden, unauthorized } from "../errors";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
  emailVerified: boolean;
  avatarKey: string | null;
  dateOfBirth: Date | null;
  aiConsent: boolean;
  hasPassword: boolean;
  createdAt: Date;
};

/**
 * Resolves the signed-in user from the session cookie and re-checks it against
 * the database on every request, so role changes, password changes
 * (sessionVersion bump) and account deletion take effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  const u = await db.user.findUnique({ where: { id: uid } });
  if (!u) return null;
  if (u.sessionVersion !== (session as { sv?: number }).sv) return null;
  if (!u.lastActiveAt || Date.now() - u.lastActiveAt.getTime() > 60 * 60 * 1000) {
    db.user.update({ where: { id: u.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    timezone: u.timezone,
    emailVerified: Boolean(u.emailVerifiedAt),
    avatarKey: u.avatarKey,
    dateOfBirth: u.dateOfBirth,
    aiConsent: Boolean(u.aiConsentAt),
    hasPassword: Boolean(u.passwordHash),
    createdAt: u.createdAt,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

export const isAdmin = (u: Pick<SessionUser, "role">) => u.role === "ADMIN" || u.role === "SUPER_ADMIN";

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isAdmin(u)) throw forbidden();
  return u;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "SUPER_ADMIN") throw forbidden();
  return u;
}
