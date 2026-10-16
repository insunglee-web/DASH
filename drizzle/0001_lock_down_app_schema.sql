-- Custom SQL migration file, put your code below! --
-- app 스키마를 Supabase Data API(anon/authenticated 역할)에서 완전히 차단한다 (docs/security.md 3장).
-- 앱은 DATABASE_URL의 DB 사용자로만 접속하므로 RLS 정책은 만들지 않는다(= anon/authenticated는 아무것도 못 읽음).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA app FROM anon';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA app FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA app FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END
$$;
