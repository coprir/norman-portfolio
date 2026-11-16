import { exportUserData } from "@/server/account";
import { api } from "@/server/api";

export const GET = api({ rateLimit: { name: "export", limit: 6, windowSec: 3600 } }, async ({ user }) => {
  const data = await exportUserData(user);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dear-future-me-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
