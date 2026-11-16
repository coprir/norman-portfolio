import { api } from "@/server/api";
import { listMemories, type MemoryQuery } from "@/server/memories";

const TYPES = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "LETTER"];
const SORTS = ["newest", "oldest", "uploaded", "name", "size"];

export const GET = api({}, async ({ req, user }) => {
  const p = req.nextUrl.searchParams;
  const type = p.get("type");
  const sort = p.get("sort");
  return listMemories(user.id, {
    q: p.get("q") ?? undefined,
    type: type && TYPES.includes(type) ? (type as MemoryQuery["type"]) : undefined,
    categoryId: p.get("category") ?? undefined,
    albumId: p.get("album") ?? undefined,
    tag: p.get("tag") ?? undefined,
    from: validDate(p.get("from")),
    to: validDate(p.get("to")),
    sort: sort && SORTS.includes(sort) ? (sort as MemoryQuery["sort"]) : undefined,
    page: Number(p.get("page") ?? 0) || 0,
  });
});

function validDate(v: string | null) {
  return v && !Number.isNaN(new Date(v).getTime()) ? v : undefined;
}
