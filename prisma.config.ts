import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
export default defineConfig({
  experimental: { adapter: true },
  schema: "prisma/schema.prisma",
  engine: "js",
  adapter: async () =>
    new PrismaPg({
      connectionString:
        process.env.DATABASE_URL || "postgresql://localhost/lner",
    }),
});
