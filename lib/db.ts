import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";

const projectRoot = process.env.INIT_CWD?.trim() || process.cwd();
const defaultDbPath = path.resolve(projectRoot, "prisma", "dev.db");
mkdirSync(path.dirname(defaultDbPath), { recursive: true });
const adapter = new PrismaBetterSqlite3({ url: defaultDbPath });
export const db = new PrismaClient({
  adapter,
  log: ["error", "warn"]
});
