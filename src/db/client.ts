import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Vercel 함수에서는 Supabase 연결 풀러(트랜잭션 모드)로 접속한다.
// 트랜잭션 모드는 prepared statement를 지원하지 않으므로 prepare: false.
let cached: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  const client = postgres(url, { prepare: false, max: 1, ssl: "require" });
  cached = drizzle(client, { schema });
  return cached;
}
