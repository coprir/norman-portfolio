import { notFound, redirect } from "next/navigation";
import { Admin } from "@/components/admin";
import { adminOverview } from "@/server/admin";
import { getCurrentUser, isAdmin } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  // Ordinary users get the same page as a URL that doesn't exist.
  if (!isAdmin(user)) notFound();
  return <main id="main"><Admin overview={await adminOverview()} isSuper={user.role === "SUPER_ADMIN"} /></main>;
}
