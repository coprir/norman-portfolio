import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";

export const metadata = { title: "Create your account" };

export default async function Page() {
  if (await getCurrentUser()) redirect("/app");
  return (
    <Suspense>
      <RegisterForm google={env.googleEnabled} />
    </Suspense>
  );
}
