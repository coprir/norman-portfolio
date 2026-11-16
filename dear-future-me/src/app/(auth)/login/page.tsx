import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";

export const metadata = { title: "Sign in" };

export default async function Page() {
  if (await getCurrentUser()) redirect("/app");
  return (
    <Suspense>
      <LoginForm google={env.googleEnabled} />
    </Suspense>
  );
}
