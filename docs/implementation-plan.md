# 구현 계획

- 작성일: 20261016 (같은 날 배포 구성을 GitHub + Vercel + Supabase로 변경해 반영)
- 원칙: 검증 → 읽기 → 쓰기 순서로 진행한다. 각 단계 끝에 사용자 확인을 받는다. 쓰기 기능은 테스트 캘린더에서 먼저 검증한다.

## 1. 개발 환경 확인 결과 (20261016)
| 항목 | 상태 |
|---|---|
| 기존 작업 폴더 | `C:\Windows\System32`(시스템 폴더라 프로젝트 위치로 부적합). 프로젝트 폴더와 마스터 요구사항 문서는 찾지 못했다. → `C:\Users\leeinsung\personal-dashboard` 새로 생성 |
| Node.js | v24.18.0 설치됨, npm 있음 |
| Git | 2.55.0 설치됨 (이 폴더는 아직 git 저장소가 아님) |
| Python | 실제 설치 없음(Windows Store 연결 스텁만 있음). 필요 없다. |
| Docker | 없음. 필요 없다. 개발용 DB는 Supabase Free 두 번째 프로젝트를 쓴다(Free는 프로젝트 2개). |
| 클라우드 CLI | **설치하지 않는다.** Google Cloud CLI, Vercel CLI, Supabase CLI 모두 쓰지 않고 웹 콘솔과 GitHub 연동만 쓴다. DB 마이그레이션은 프로젝트의 npm 스크립트(ORM 마이그레이션)로 실행한다. |
| psql | 없음. 필요 없다(Supabase 웹 SQL 편집기로 대체). |

## 2. 단계별 계획

### 0단계: 사전 결정과 준비 (사용자)
- [x] 의사결정 D-01~D-11 확정(20261016). D-01 GitHub + Vercel Hobby(icn1) + Supabase Cron, D-09 Supabase Free(서울), D-11 Apps Script 캘린더 브리지, D-06 GitHub 로그인
- [x] 배포 계정 확인: GitHub `insunglee-web`, Vercel `holden9`
- [x] NAVER WORKS 플랜 Standard 확인
- [ ] NAVER WORKS 앱 등록 승인
- [ ] 각 서비스 계정 준비와 개발자 앱 등록(4장)
- 완료 기준: integration-checklist.md의 ❓ 항목이 모두 해소됨

### 1단계: 프로젝트 골격
- `git init`, GitHub 비공개 저장소 연결, `.gitignore`(`.env*` 포함), `.env.example`(키 이름만)
- Next.js(TypeScript) + ORM(Prisma 또는 Drizzle) + PostgreSQL 스키마(database-schema.md, `app` 스키마)
- 한국어 UI 기본 레이아웃, 반응형 3단계, `YYYYMMDD` 날짜 유틸(Asia/Seoul 고정)과 단위 테스트
- 대시보드 로그인(GitHub OAuth App + 허용 계정 숫자 ID), 세션, 보안 헤더
- Apps Script 브리지 코드(`apps-script/` 폴더: `Code.gs`, `appsscript.json`)와 서버 측 서명 클라이언트. 사용자가 script.google.com에 붙여넣어 배포한다.
- 토큰 암호화 모듈, 외부 API 공통 클라이언트(재시도, 속도 제한, 로그 마스킹)와 단위 테스트
- 완료 기준: 로컬(`npm run dev`)에서 개발용 Supabase DB에 연결해 로그인 후 빈 대시보드 표시, 테스트 통과

#### 1단계 결과 (20261016)
- 완료: Next.js 16.4.2 골격, 한국어 반응형 화면 5종(오늘/일정/메일/회의록/설정) + 로그인 화면, GitHub 로그인·세션(유휴 12시간/절대 7일), proxy 접근 제어와 CSRF 출처 검사, 보안 헤더(CSP 등), 토큰 암호화(AES-256-GCM, 키 교체 지원), 재시도·속도 제한 클라이언트, 로그 마스킹, Drizzle 스키마 17개 테이블과 마이그레이션 SQL(`app` 스키마 + Data API 차단), 작업 엔드포인트(`/api/jobs/tick`, `/api/jobs/heartbeat`, CRON_SECRET 검증), Apps Script 브리지(`apps-script/`)와 서버 서명 클라이언트
- 검증: 단위 테스트 46개 통과(Apps Script 코드를 모의 Google 서비스에서 실행해 서명·허용 목록·테스트 모드 보호 확인), 타입 검사·린트·프로덕션 빌드 통과, 로컬에서 비로그인 접근 차단(307), 작업 엔드포인트 비인증 401, 다른 출처 POST 403, 보안 헤더 확인, 744/1133/1600px 레이아웃 확인(가로 스크롤 없음)
- 미검증: 실제 GitHub 로그인(OAuth App 미생성), 실제 DB 연결과 마이그레이션 적용(Supabase 미생성), 실제 Apps Script 배포
- 확인 필요: `appsscript.json`의 `webapp` 설정이 배포 화면 선택과 일치하는지, `createAllDayEvent`의 종료일이 배타적인지, `vercel.json`의 `regions: ["icn1"]`이 Hobby에서 적용되는지
- git: 저장소 초기화만 했고 커밋·push는 하지 않았다.

### 2단계: 연동 PoC (읽기 전용, integration-checklist.md 4장)
- NAVER WORKS `mail.read`, Apps Script 브리지 읽기, Notion 읽기 각각 연결과 1회 조회(로컬 `http://localhost:3000`)
- 읽음 처리 부작용, 하위 페이지 계층, 호출 한도 헤더 확인
- 완료 기준: 검증 항목 결과를 integration-checklist.md에 기록

### 3단계: Notion 회의록
- 페이지 트리 수집, 날짜 추출(`YYYYMMDD` + 요일/주제), 본문 재귀 수집, 변경 감지, 뷰어
- 완료 기준: 실제 회의록 페이지 목록이 `YYYYMMDD`로 정렬되어 보이고, 추출 실패 건이 "날짜 미확인"으로 분리됨

#### 3단계 진행 (20261016, 코드 완료 · 실제 Notion 연결 전)
- 로그인 시 `app_user` 저장(DB 사용 시작), 설정 화면에 DB 연결 상태(응답 시간)와 Notion 마지막 동기화 표시
- Notion 읽기 클라이언트(속도 제한·재시도), 하위 페이지 트리 수집(깊이 `NOTION_MAX_DEPTH`), 블록 정규화(문단·제목·목록·할 일·토글·인용·콜아웃·코드·표·구분선·링크, 이미지 등은 "Notion에서 확인" 안내), XSS 방지(HTML 삽입 없음, http/https 링크만)
- 동기화: 실행 잠금, 제목 날짜 추출, 사라진 페이지 보관 처리, 본문은 처음·변경·최근 14일 페이지만, 240초 예산 초과 시 다음으로 미룸, `sync_run` 기록
- 화면: 회의록 목록(날짜별/날짜 미확인), 본문 뷰어(`/notes/[id]`), 오늘 화면의 해당 날짜 회의록, 설정 화면 "회의록 지금 동기화" 버튼
- 검증: 단위 테스트 52개(가짜 Notion API로 트리·페이지네이션·본문 변환·권한 오류 확인), 타입 검사·린트·빌드 통과
- 미검증: 실제 Notion 응답(`NOTION_INTERNAL_TOKEN` 미설정), `page_size=100` 허용 여부, child_page 블록 수정 시각이 본문 수정을 반영하는지(그래서 최근 14일 페이지는 매번 다시 읽음)

### 4단계: Google Calendar 읽기 → 쓰기 (Apps Script 브리지)
- 4-1 읽기: 캘린더 선택, 기간 창(-7일~+60일) 동기화, 일/주 보기
- 4-2 쓰기: 단일 일정 생성·수정·삭제, 수정 시각 기반 충돌 처리, 감사 로그. **블루캐니언워터파크 캘린더에서 `[테스트]` 일정으로 먼저 검증**(integration-checklist.md 2-4절)
- 완료 기준: 테스트 일정 CRUD 성공, 충돌 시나리오 통과, 허용 목록 밖 쓰기 거부, 테스트 일정 잔존 0건

### 5단계: NAVER WORKS 메일과 중요도 분류
- 받은메일함 증분 수집, 규칙 엔진, 분류 근거 표시, 사용자 보정, 규칙 설정 화면
- 완료 기준: 최근 메일 100건의 분류 결과를 사용자가 검토해 기준값 조정

### 6단계: 스케줄러, 재시도, 모니터링
- `/api/jobs/tick`(Bearer CRON_SECRET), `/api/jobs/heartbeat`, 실행 잠금, 240초 실행 예산, 커서 재개, 재시도 정책, 실패 경고
- 완료 기준: 인위적 429/500 주입 테스트 통과, 시간 초과 시 다음 tick으로 이어서 실행, 연속 실패 경고 표시

### 7단계: 배포와 보안 점검
- Vercel에 GitHub 저장소 연결 → 함수 리전 `icn1` 설정 → Production 환경 변수 등록(Sensitive) → 배포
- 운영 Supabase 프로젝트(서울)에 마이그레이션 적용, Data API 비활성 또는 RLS 확인
- Supabase Cron에 5분 tick 작업 등록(CRON_SECRET은 Vault), Vercel Cron에 하루 1회 heartbeat 등록(`vercel.json`)
- NAVER WORKS Redirect URL과 GitHub OAuth App(운영용) callback에 운영 주소(`https://<프로젝트>.vercel.app/...`) 등록
- 보안 점검(security.md 체크리스트)
- 완료 기준: iPad mini 6 Safari와 Windows PC에서 전체 흐름 확인, 24시간 동안 tick 정상 기록

### 8단계(선택): 개선
- PWA, 반복 일정 편집, 개인 도메인

## 3. 환경 변수 목록 (값은 넣지 않음)

보관 위치: 로컬 개발은 `.env.local`(git 제외), 운영은 **Vercel 프로젝트 환경 변수(Production 전용)**. "Sensitive" 표시는 Vercel에서 Sensitive로 등록한다는 뜻이다.

| 변수 | 용도 | Sensitive |
|---|---|---|
| `APP_BASE_URL` | 배포 주소(OAuth redirect 생성) | |
| `APP_TIMEZONE` | `Asia/Seoul` | |
| `DATABASE_URL` | Supabase 연결 풀러 주소(앱 실행용) | ✅ |
| `DIRECT_DATABASE_URL` | Supabase 직접 연결 주소(마이그레이션용, 로컬에서만) | ✅ |
| `SESSION_SECRET` | 세션 서명 | ✅ |
| `TOKEN_ENCRYPTION_KEY` | 토큰 암호화(32바이트, base64) | ✅ |
| `TOKEN_ENCRYPTION_KEY_VERSION` | 키 버전 | |
| `CRON_SECRET` | `/api/jobs/*` 호출 인증(Supabase Vault에도 같은 값) | ✅ |
| `GITHUB_CLIENT_ID` | 대시보드 로그인용 GitHub OAuth App(개발/운영 따로) | |
| `GITHUB_CLIENT_SECRET` | 같은 App의 secret | ✅ |
| `ALLOWED_GITHUB_USER_ID` | 로그인 허용 GitHub 숫자 ID(`insunglee-web`의 ID) | |
| `GAS_CALENDAR_WEBAPP_URL` | Apps Script 웹 앱 `/exec` URL | ✅ |
| `GAS_CALENDAR_SHARED_SECRET` | 브리지 HMAC 서명 비밀값(Apps Script 스크립트 속성 `SHARED_SECRET`과 같은 값) | ✅ |
| `NOTION_INTERNAL_TOKEN` | Internal connection 토큰 | ✅ |
| `NOTION_API_VERSION` | 예: `2026-03-11` (구현 시 재확인) | |
| `NOTION_MEETING_ROOT_PAGE_ID` | `39dfa7ab-52b6-80c9-9e08-db79b4afe378` | |
| `NOTION_MAX_DEPTH` | 하위 페이지 탐색 깊이, 기본 2 | |
| `NAVERWORKS_CLIENT_ID` | NAVER WORKS OAuth | |
| `NAVERWORKS_CLIENT_SECRET` | NAVER WORKS OAuth | ✅ |
| `NAVERWORKS_SCOPES` | `mail.read` | |
| `NAVERWORKS_DOMAIN` | SSO 사용 시 domain 파라미터(필요한 경우만) | |
| `MAIL_RETENTION_DAYS` | `90` | |
| `JOB_TIME_BUDGET_SECONDS` | tick 실행 예산, `240` | |
| `LOG_LEVEL` | 로그 수준 | |

## 4. 사용자가 직접 준비해야 하는 항목

### 결정과 확인
1. ~~의사결정 D-01~D-11~~ → 확정(20261016)
2. ~~NAVER WORKS 플랜~~ → Standard(20261016). **앱 등록 승인**은 남아 있다 → integration-checklist.md 1-4절
3. ~~메일 메타데이터 외부 저장, Google 계정 유형, Notion 정보, 테스트 캘린더~~ → 확인 완료(20261016)
4. ~~블루캐니언워터파크 캘린더 공유 여부~~ → 사용자 혼자 쓰는 캘린더(20261016)

### 계정과 콘솔 작업 (모두 웹 화면에서 진행. 토큰과 비밀번호는 대화나 코드에 붙여넣지 말 것)
5. ~~GitHub, Vercel 계정~~ → 있음(`insunglee-web`, `holden9`). 두 계정 모두 2단계 인증이 켜져 있는지 확인
6. **Supabase** Free 가입(GitHub 계정으로 가입 가능, 2단계 인증) → 프로젝트 2개 생성: `dashboard-dev`, `dashboard-prod`, 둘 다 리전 **Seoul (ap-northeast-2)**. DB 비밀번호는 강한 랜덤값으로 정하고 비밀번호 관리자에 보관
7. ~~Google Cloud 웹 콘솔~~ → **사용하지 않음**(C-16). 대신 **Apps Script**: 본인 Gmail로 script.google.com에서 프로젝트를 만들고, 2단계에서 제공하는 코드를 붙여넣어 웹 앱으로 배포한다(integration-checklist.md 2-5절)
8. **GitHub OAuth App**(대시보드 로그인용, **운영용 하나만** 사용 — 20261016 사용자 결정): GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - Application name: `DASH`
   - Homepage URL: `https://dash-mu-ten.vercel.app`
   - Authorization callback URL: `https://dash-mu-ten.vercel.app/api/auth/github/callback`
   - 만든 뒤 Client ID와 **Generate a new client secret**으로 만든 비밀값을 Vercel 환경 변수 `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`(Sensitive)에 직접 입력
   - 영향: 로컬(`localhost`)에서는 GitHub 로그인을 할 수 없다. 로그인이 필요한 확인은 운영 주소에서 하고, 로컬에서는 단위 테스트와 빌드로 확인한다.
9. **NAVER WORKS** Developer Console 앱 생성(또는 관리자에게 요청) → Client ID/Secret 발급 → Redirect URL 등록 → scope `mail.read` → 토큰 설정(Access Token 1시간, Rotation On) → Admin > Apps에서 본인을 사용자로 지정
10. **Notion** Internal connection 생성(콘텐츠 읽기만) → 기존 「놀발 업무일지 및 미팅록」 페이지에 연결 추가. **새 페이지는 만들지 않는다**(integration-checklist.md 3-3절)

- 발급받은 비밀값은 2단계에서 로컬 `.env.local`에, 7단계에서 Vercel 환경 변수에 **사용자가 직접** 입력한다.

## 5. 예상 운영 비용

| 항목 | 예상 | 근거 |
|---|---|---|
| GitHub 비공개 저장소 | 0원 | 저장만 하고 Actions는 쓰지 않는다. |
| Vercel Hobby | 0원 | 함수 호출 월 100만 회와 Active CPU 4시간이 무료 범위다(공식 문서). 5분 tick은 월 약 8,640회다. CPU 사용량은 운영하면서 관찰한다. |
| Supabase Free | 0원 | 프로젝트 2개, DB 500MB(공식 문서). 예상 사용량은 수십 MB 수준이다. |
| Supabase Cron | 0원(예상) | Supabase 기능으로 제공된다. Free 플랜에서 쓸 수 있는지는 프로젝트 생성 후 확인한다(검증 필요). |
| Google Apps Script | 0원(예상) | 일반 Gmail 무료 한도 안에서 쓴다. 카드 등록이 필요 없는지는 사용자가 프로젝트를 만들 때 확인한다. |
| Notion / NAVER WORKS API | 0원 | NAVER WORKS는 회사 Standard 플랜에 포함된다. |
| GitHub OAuth App | 0원 | |
| 도메인 | 0원 | `*.vercel.app`을 쓴다. |

- 예상 합계: **월 0원**. 무료 한도를 넘거나 Vercel 상업적 용도 판단이 바뀌면 Vercel Pro / Supabase Pro 유료 전환을 검토한다(전환 시 최신 요금 확인).

## 6. 위험 요소와 대응
| 위험 | 영향 | 대응 |
|---|---|---|
| NAVER WORKS 앱 등록 승인 지연·거절 | 메일 기능 불가 | 0단계에서 가장 먼저 진행. 거절되면 메일 기능 범위를 다시 정의 |
| 메일 상세 조회가 읽음 처리됨 | 실제 메일 상태 변경 | 목록 메타데이터만으로 분류(현재 설계) |
| Apps Script 브리지 공개 URL 악용 | 일정 조회·수정 시도 | HMAC 서명, 시간 제한, nonce, 쓰기 허용 캘린더 제한 |
| Apps Script 권한 취소·배포 URL 변경 | 캘린더 동기화 중단 | 연속 실패 시 "재승인 필요" 표시, 배포는 새로 만들지 말고 갱신 |
| 블루캐니언워터파크 캘린더 테스트 중 실수 | 실제 일정 변경 | `[테스트]` 일정만 조작, 게스트 추가 금지, 테스트 후 잔존 확인 |
| Notion 제목 형식 불규칙 | 날짜 누락 | "날짜 미확인" 목록과 수동 지정 |
| 회사 도메인 단위 호출 한도 공유 | 다른 사내 연동과 충돌 | 낮은 호출 빈도, 헤더 기반 속도 조절 |
| Supabase Free 일시정지 | 동기화·화면 중단 | 5분 tick으로 DB 활동 유지, heartbeat 경고, 경고 메일 수신 시 Pro 검토 |
| Supabase Cron 정지 | 데이터가 갱신되지 않음 | Vercel Cron heartbeat(하루 1회)와 화면의 "마지막 동기화" 표시 |
| Vercel 함수 300초 제한 | 대량 동기화 중단 | 240초 예산과 커서 재개 |
| Vercel Hobby 약관(비상업적 용도) | 계정 제한 가능성 | 본인 전용·무수익 용도 유지. 판단이 바뀌면 Pro 전환 |
| 3개 서비스(GitHub/Vercel/Supabase)에 비밀 분산 | 관리 복잡도 | 4장 목록으로 관리, 2단계 인증 필수 |
