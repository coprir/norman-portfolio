import { api } from "@/server/api";
import { createPortal } from "@/server/billing";

export const POST = api({}, async ({ user }) => createPortal(user));
