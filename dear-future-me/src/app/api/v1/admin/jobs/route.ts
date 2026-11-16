import { adminJobs } from "@/server/admin";
import { api } from "@/server/api";

export const GET = api({ auth: "admin" }, async ({ req }) => {
  const f = req.nextUrl.searchParams.get("filter");
  return { jobs: await adminJobs(f === "upcoming" || f === "all" ? f : "problem") };
});
