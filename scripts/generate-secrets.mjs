// 로컬에서 비밀값을 만든다. 출력값은 대화창이나 코드에 붙여넣지 말고
// .env.local, Vercel 환경 변수, Apps Script 스크립트 속성에만 직접 입력한다.
import { randomBytes } from "node:crypto";

const values = {
  SESSION_SECRET: randomBytes(32).toString("base64url"),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(32).toString("base64url"),
  GAS_CALENDAR_SHARED_SECRET: randomBytes(32).toString("base64url"),
};

for (const [key, value] of Object.entries(values)) console.log(`${key}=${value}`);
console.log("\n# GAS_CALENDAR_SHARED_SECRET 값은 Apps Script 스크립트 속성 SHARED_SECRET에도 똑같이 넣습니다.");
console.log("# CRON_SECRET 값은 7단계에서 Supabase Vault에도 넣습니다.");
