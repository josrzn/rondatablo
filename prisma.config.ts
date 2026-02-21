import path from "node:path";
import { defineConfig } from "prisma/config";

const envUrl = process.env.DATABASE_URL?.trim();
const localDbUrl = `file:${path.resolve(process.cwd(), "prisma", "dev.db")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: envUrl && envUrl.length > 0 ? envUrl : localDbUrl
  }
});
