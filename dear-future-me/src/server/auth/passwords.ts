import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

/** Compares against a dummy hash when the user has none, to keep timing flat. */
const DUMMY = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8rQ8rQ8rQ8rQ8rQ8rQ8rQ8rQ8rQ8rQ";
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY).catch(() => false);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
