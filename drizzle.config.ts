import { defineConfig } from "drizzle-kit";

// 마이그레이션은 로컬 PC에서 Supabase 직접 연결 주소(DIRECT_DATABASE_URL)로 실행한다.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["app"],
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
