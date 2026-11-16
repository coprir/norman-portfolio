import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/passwords";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { ensureSubscription } from "@/server/plans";

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const ip = request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        try {
          await rateLimit(`login:ip:${ip}`, 30, 600);
          await rateLimit(`login:email:${email}`, 8, 600);
        } catch {
          return null;
        }
        const user = await db.user.findUnique({ where: { email } });
        const ok = await verifyPassword(parsed.data.password, user?.passwordHash);
        if (!user || !ok) {
          await audit({ userId: user?.id, action: "auth.login_failed", ip });
          return null;
        }
        await audit({ userId: user.id, action: "auth.login", ip });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      // Only accept Google identities whose email Google has verified.
      if (!profile?.email || profile.email_verified !== true) return false;
      const email = profile.email.toLowerCase();
      const existing = await db.user.findUnique({ where: { email } });
      if (!existing) {
        const created = await db.user.create({
          data: { email, name: profile.name ?? email.split("@")[0], emailVerifiedAt: new Date() },
        });
        await ensureSubscription(created.id);
        await audit({ userId: created.id, action: "auth.register", metadata: { via: "google" } });
      } else if (!existing.emailVerifiedAt) {
        await db.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Runs with `user` only at sign-in: pin the token to our own user row.
      if (user?.email || account) {
        const email = (user?.email ?? token.email ?? "").toLowerCase();
        const row = await db.user.findUnique({ where: { email }, select: { id: true, sessionVersion: true } });
        if (row) {
          token.uid = row.id;
          token.sv = row.sessionVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        (session as { sv?: number }).sv = token.sv as number;
      }
      return session;
    },
  },
});
