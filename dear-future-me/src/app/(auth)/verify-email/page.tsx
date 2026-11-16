import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/forms";

export const metadata = { title: "Confirm your email" };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
