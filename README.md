# 개인 업무 통합 대시보드

Google Calendar(일정), NAVER WORKS(메일 중요도 분류), Notion(날짜별 회의록)을 한 화면에서 보는 개인용 대시보드입니다. iPad mini 6과 Windows PC에서 쓰도록 만들었습니다.

- 설계 문서: [`docs/`](docs/) (요구사항, 아키텍처, DB, 연동 체크리스트, 보안, 구현 계획)
- 구성: Next.js 16 · Vercel Hobby(서울) · Supabase Free(서울) · Supabase Cron · Apps Script 캘린더 브리지
- 날짜 표기는 `YYYYMMDD`, 시간대는 Asia/Seoul

## 로컬 실행

```bash
npm install
```

```bash
npm run secrets
```

`npm run secrets`가 출력한 값과 각 서비스에서 받은 값을 `.env.local`에 넣습니다(`.env.example` 참고). `.env.local`은 git에 올라가지 않습니다.

```bash
npm run dev
```

http://localhost:3000 에서 GitHub로 로그인합니다. 설정 화면에서 환경 변수 준비 상태를 볼 수 있습니다(값은 표시하지 않음).

## 자주 쓰는 명령

| 명령 | 내용 |
|---|---|
| `npm test` | 단위 테스트(날짜, 암호화, 재시도, 세션, Apps Script 브리지) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 린트 |
| `npm run build` | 프로덕션 빌드 |
| `npm run db:generate` | 스키마(`src/db/schema.ts`)에서 마이그레이션 SQL 생성 |
| `npm run db:migrate` | `.env.local`의 `DIRECT_DATABASE_URL`로 마이그레이션 적용 |

## 폴더 구조

```
src/app/(dashboard)/   오늘·일정·메일·회의록·설정 화면
src/app/login/         로그인 화면
src/app/api/auth/      GitHub 로그인
src/app/api/jobs/      Supabase Cron / Vercel Cron이 호출하는 작업 엔드포인트
src/proxy.ts           로그인 검사와 CSRF(출처) 검사
src/lib/               날짜, 세션, 암호화, 재시도, Apps Script 클라이언트
src/db/                Drizzle 스키마와 DB 연결
drizzle/               마이그레이션 SQL
apps-script/           Google Calendar 브리지 (script.google.com에 붙여넣기)
```

## Apps Script 캘린더 브리지

[`apps-script/README.md`](apps-script/README.md)를 참고하세요.
