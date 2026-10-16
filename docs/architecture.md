# 아키텍처 설계 (초안)

- 작성일: 20261016
- 전제: 단일 사용자 개인 대시보드. 모든 외부 API 호출은 서버에서만 한다. 브라우저에는 토큰을 절대 보내지 않는다.

## 1. 확정된 사항
- 외부 연동 3종: Notion(읽기), Google Calendar(읽기·쓰기), NAVER WORKS 메일(읽기 + 분류)
- 클라우드 배포, 한국어 UI, `YYYYMMDD` 날짜 표기, iPad mini 6과 Windows PC 지원

## 2. 확정 구성 (D-01, D-09, D-10 확정: 20261016)

GitHub + Vercel Hobby(서울 `icn1`) + Supabase Free(서울 `ap-northeast-2`) + Supabase Cron. Google Cloud CLI와 Vercel CLI는 쓰지 않는다. 배포는 GitHub 저장소를 Vercel에 연결해 push하면 자동으로 이뤄진다.

```
[iPad mini / Windows PC 브라우저]
        │ HTTPS (세션 쿠키: HttpOnly, Secure, SameSite=Lax)
        ▼
[Vercel Hobby — Next.js(TypeScript) 함수, 리전 icn1(서울)]
   ├─ UI 렌더링 (DB 캐시 데이터 기반)
   ├─ /api/*        : 화면용 API (세션 인증)
   ├─ /api/oauth/*  : 각 서비스 OAuth 시작/콜백
   └─ /api/jobs/*   : 동기화 작업 엔드포인트 (Authorization: Bearer CRON_SECRET 검증)
        │  비밀값: Vercel 환경 변수(Sensitive)
        │
        ├──▶ [Supabase Free PostgreSQL, 서울]  캐시 데이터, 동기화 상태, 암호화된 토큰
        │      (Vercel 함수에서는 Supabase 연결 풀러로 접속)
        └──▶ 외부 API
              ├─ api.notion.com
              ├─ script.google.com/macros/s/.../exec  (Apps Script 캘린더 브리지)
              └─ www.worksapis.com/v1.0  (인증: auth.worksmobile.com)

[Supabase Cron] ──(5분마다 HTTP POST, Bearer CRON_SECRET)──▶ /api/jobs/tick
[Vercel Cron]   ──(하루 1회, 보조 점검)──────────────────────▶ /api/jobs/heartbeat
[GitHub 비공개 저장소] ──(push)──▶ Vercel 자동 배포
```

- 앱은 `DATABASE_URL`로만 DB에 접속한다. Supabase의 Data API(PostgREST)와 Supabase Auth는 쓰지 않는다. 나중에 다른 PostgreSQL로 옮길 수 있게 하기 위해서다.
- 대시보드 로그인(D-06)은 GitHub OAuth App 로그인으로 하고, GitHub 계정 `insunglee-web`만 허용한다. Google Cloud Console은 쓰지 않는다(C-16).
- 배포 계정: GitHub `insunglee-web`, Vercel `holden9`.

### 플랫폼 제약 (공식 문서 확인, 20261016)
| 항목 | 내용 | 설계 반영 |
|---|---|---|
| Vercel Hobby 용도 | 비상업적 개인 용도만 허용된다. 결제, 광고, 돈을 받고 제작·호스팅하는 경우가 상업적 용도의 예다. | 본인 전용 업무 정리 도구로 사용자 판단하에 개인 용도로 본다. 문제가 되면 Pro로 전환한다. |
| Vercel Hobby Cron | 하루 1회만 가능하고 실행 시각은 ±59분 오차가 있다. 더 잦은 주기는 배포가 실패한다. | 주기 작업은 Supabase Cron이 맡는다. Vercel Cron은 하루 1회 보조 점검에만 쓴다. |
| Vercel 함수 실행 시간 | Hobby는 기본이자 최대 300초 | 한 번의 tick은 240초 예산 안에서만 일하고, 남은 일은 커서로 다음 tick에 넘긴다. |
| Vercel 함수 리전 | 기본은 `iad1`(미국)이다. 서울 `icn1`이 있다. | 프로젝트 기본 함수 리전을 `icn1`로 설정한다(Hobby에서 변경 가능한지 검증 필요). |
| Vercel Hobby 사용량 | 함수 호출 월 100만 회, Active CPU 4시간 | 5분 tick은 월 약 8,640회로 여유가 있다. CPU는 대부분 I/O 대기라 적게 쓸 것으로 예상한다(관찰 필요). |
| Supabase Free | 프로젝트 2개, DB 500MB. 1주일간 DB 사용이 적으면 일시정지된다(기준 수치는 비공개). | 5분 tick이 매번 `sync_state`를 갱신해 활동을 유지한다. 메일 본문을 저장하지 않으므로 500MB에 여유가 있다. |
| Supabase Cron | 매초부터 연 1회까지 지정할 수 있고 HTTP 요청을 보낼 수 있다. 동시 작업 8개 이하, 작업당 10분 이내를 권장한다. | tick 작업 1개만 등록한다. |

## 3. Notion 연동 구조 (날짜별 일반 페이지)

데이터베이스 쿼리 API는 사용하지 않는다. 페이지 트리를 순회한다.

1. 설정값 `NOTION_MEETING_ROOT_PAGE_ID`로 회의록 상위 페이지를 지정한다.
2. `GET /v1/blocks/{root_id}/children`(페이지네이션: `has_more`, `next_cursor`)로 하위 블록을 조회하고 `type = child_page`인 블록만 고른다.
   - 연/월 중간 페이지가 있으면(V-06) 설정한 깊이(기본 2)까지 `child_page`를 재귀 탐색한다.
3. `child_page.title`에서 날짜를 추출한다. 실제 제목 형식은 확정됐다(20261016, 예: `20260709 목`, `20260906 사업계획`).
   - 1순위 정규식 `^\s*(\d{8})(?:\s+(.+))?$`. 8자리가 실제 달력 날짜인지(예: 20260230 거부) 검증한다.
   - 뒤의 문자열이 요일 한 글자(월화수목금토일)이면 일반 회의록으로, 그 외(예: `사업계획`)는 `title_suffix`로 저장해 주제로 표시한다.
   - 요일 표기가 실제 날짜의 요일과 다르면 경고 플래그만 남긴다(데이터는 수정하지 않음).
   - 같은 날짜에 여러 페이지가 있을 수 있다. `meeting_date`는 unique가 아니다.
   - 추출에 실패하면 `date_source = unparsed`로 저장하고 "날짜 미확인" 목록에 표시한다.
4. 페이지 메타데이터(`GET /v1/pages/{id}`)의 `last_edited_time`이 저장값과 같으면 본문 조회를 건너뛴다.
5. 본문: `GET /v1/blocks/{page_id}/children`을 재귀 호출한다(`has_children = true`인 블록). 최대 깊이와 최대 블록 수에 상한을 둔다.
   - 하위 페이지(`child_page`)는 본문에 포함하지 않고 링크로만 표시한다.
   - `type = unsupported` 블록은 "Notion에서 보기"로 표시한다.
6. 렌더링용으로 정규화한 JSON(블록 트리)을 DB에 저장한다. 원본 블록 전체를 저장하지 않고 필요한 필드만 남긴다.
7. Search API는 결과 완전성이 보장되지 않을 수 있어 보조 수단으로만 쓴다(검증 필요).

- 호출 제한: 평균 초당 3회(Business/Enterprise는 초당 10회). 워크스페이스 공용 한도도 있다. 클라이언트에서 초당 2회로 자체 제한한다.
- 필수 헤더: `Notion-Version`. 공식 문서의 현재값은 `2026-03-11`이다. 구현 시점에 다시 확인하고 버전을 고정한다.

## 4. Google Calendar 연동 구조 (Apps Script 브리지, D-11)

Google Cloud Console을 쓰지 않으므로(C-16) Calendar REST API와 OAuth 클라이언트 대신 **Google Apps Script 웹 앱**을 중간 다리로 쓴다.

```
[Vercel 서버] ──HTTPS POST(JSON, HMAC 서명)──▶ [Apps Script 웹 앱 /exec]
                                              │ "나로 실행" = 본인 Gmail 권한
                                              ▼
                                          CalendarApp (본인 캘린더)
```

### 4-1. Apps Script 구성
- 본인 Gmail로 script.google.com에서 독립 실행형 프로젝트 `dashboard-calendar-bridge`를 만든다. 기본 Cloud 프로젝트는 자동으로 생성되며 Cloud Console에 접근할 필요가 없다(공식 문서).
- `appsscript.json`: `timeZone: "Asia/Seoul"`, `oauthScopes: ["https://www.googleapis.com/auth/calendar"]`로 명시한다. CalendarApp의 생성·삭제 메서드는 이 scope를 요구한다(공식 문서). 읽기 전용으로 좁힐 수는 없다.
- 배포: 웹 앱, 실행 사용자 = 나, 접근 권한 = 모든 사용자. 서버가 Google 로그인 없이 호출해야 하므로 공개 접근이 필요하다. 대신 아래 서명 검증으로 막는다. 접근 권한 옵션의 정확한 이름은 배포 화면에서 확인한다.
- 코드를 고칠 때는 **기존 배포를 새 버전으로 갱신**해 URL을 유지한다. 새 배포를 만들면 URL이 바뀐다(검증 필요).
- Script Properties(스크립트 속성)에 둘 값: `SHARED_SECRET`, `READ_CALENDAR_IDS`, `WRITE_CALENDAR_IDS`

### 4-2. 요청 형식과 보안
- Apps Script `doPost(e)`는 요청 본문(`e.postData`)과 파라미터는 받지만 **HTTP 헤더는 받지 않는다**(공식 문서의 이벤트 객체 필드 기준). 그래서 서명을 본문에 넣는다.
  - 본문: `{ "action": "...", "params": {...}, "ts": 1760000000, "nonce": "랜덤", "sig": "HMAC-SHA256(SHARED_SECRET, action|params|ts|nonce)" }`
  - 스크립트 검증 순서: 서명 확인(`Utilities.computeHmacSha256Signature`) → `ts`가 ±5분 이내인지 → `nonce` 재사용 여부(CacheService에 10분 보관) → 캘린더 ID가 허용 목록에 있는지
  - 비밀값은 URL 쿼리에 넣지 않는다(로그에 남을 수 있음).
- 응답: 항상 JSON `{ ok, data, error }`. Apps Script는 오류도 HTTP 200으로 돌려줄 수 있으므로 서버는 본문의 `ok`로 판단한다.
- 웹 앱 응답은 다른 주소로 리다이렉트될 수 있다. 서버의 fetch는 리다이렉트를 따라가도록 한다(검증 필요).

### 4-3. 지원 action
| action | 내용 | Apps Script 메서드(공식 문서 확인) |
|---|---|---|
| `listCalendars` | 읽기 허용 목록의 캘린더 이름·ID | `getCalendarById`, `getAllOwnedCalendars` |
| `listEvents` | 기간 창 일정(제목, 시작/종료, 종일 여부, 장소, 반복 여부, 수정 시각, iCalUID) | `getEvents`, `getLastUpdated`, `getId` |
| `createEvent` | 단일 일정 / 종일 일정 생성. **게스트를 추가하지 않는다** | `createEvent`, `createAllDayEvent` |
| `updateEvent` | 제목, 시간, 장소, 설명 수정. 저장된 수정 시각과 현재 값이 다르면 거부(충돌) | `setTitle`, `setTime`, `setAllDayDate`, `setLocation`, `setDescription` |
| `deleteEvent` | 단일 일정 삭제 | `deleteEvent` |

- 쓰기 action은 `WRITE_CALENDAR_IDS`에 있는 캘린더만 허용한다. 처음에는 테스트용 **블루캐니언워터파크** 캘린더만 넣고(C-18), 검증한 뒤 사용자가 다른 캘린더를 추가한다.
- 반복 일정은 같은 iCalUID를 공유하므로 1차에서는 읽기만 한다(F3-2). 단일 일정을 ID로 다시 찾는 방법(`getEventById` 등)은 구현 시 확인한다.

### 4-4. 동기화
- 15분마다 `listEvents`로 기간 창(-7일 ~ +60일)을 다시 받아, DB와 비교해 추가·변경·삭제를 반영한다. syncToken과 푸시 알림은 쓰지 않는다.
- 한도(일반 Gmail): 일정 생성 하루 5,000건, 실행당 6분, 사용자당 동시 실행 30개(공식 문서). 개인 사용량으로는 여유가 크다.
- 응답 시간은 수 초 걸릴 수 있다(관찰 필요). 화면은 저장 중 상태를 표시하고, 저장이 끝난 뒤 목록을 갱신한다.

## 5. NAVER WORKS 메일 연동 구조

- 인증: User Account 방식(OAuth 2.0 Authorization Code)만 가능하다. 메일 API는 Service Account 토큰을 허용하지 않는다(공식 문서 명시).
- 수집: `GET /users/me/mail/mailfolders/{folderId}/children?count=50&cursor=...`
  - 받은메일함 folderId는 `GET /users/me/mail/mailfolders`로 확인한다. 하드코딩하지 않는다.
  - 목록은 수신 시각 내림차순으로 온다고 가정한다(검증 필요). 마지막으로 수집한 `mailId` 또는 `receivedTime`보다 오래된 메일이 나오면 중단한다.
  - 안 읽은 수는 응답의 `unreadCount`를 쓴다(`/mail/unread-count` 별도 호출 불필요).
- 상세 조회(`GET /mail/{mailId}`)는 읽음 처리 부작용(V-03)을 검증하기 전까지 호출하지 않는다.
- 호출 제한: Standard 플랜 기준 API당 분당 240회, 동시 요청 5개. 초과 시 429 `TOO_MANY_REQUESTS`. 응답 헤더 `rateLimit-remaining`, `rateLimit-reset`을 읽어 속도를 조절한다.

### 중요도 분류 (규칙 기반, D-02)
점수 합산 방식. 가중치는 설정 화면에서 조정한다.

| 신호 | 출처 필드 | 예시 가중치 |
|---|---|---|
| 중요 발신자(VIP 목록) | `from.email` | +40 |
| 발신자 작성 시 중요 표시 | `isImportant` | +20 |
| 내가 수신자(to)에 직접 포함 | `to[]` | +15 |
| 제목 키워드(긴급, ASAP, 요청, 회신, 결재, 마감, 오늘까지) | `subject` | +10~30 |
| 보안 등급 Restricted/Confidential | `securityLevel` | +10 |
| 첨부 있음 | `attachCount` | +5 |
| 사내 도메인 발신 | `from.email` | +5 |
| 뉴스레터/알림 발신자 패턴(noreply 등) | `from.email` | -30 |
| 사용자 보정 이력(같은 발신자) | mail_feedback | ±가중 |

- 등급: 60점 이상 긴급, 35점 이상 중요, 10점 이상 일반, 그 미만 낮음. 기준값은 운영하면서 조정한다.
- 분류 근거(`reasons`)를 함께 저장해 화면에 표시한다.

## 6. OAuth 인증, 서버 측 호출, 토큰 보관·갱신

### 흐름
1. 사용자가 설정 화면에서 "연결" 클릭 → `/api/oauth/{provider}/start`
2. 서버가 `state`(CSRF용 랜덤값)와 PKCE `code_verifier`(지원하는 곳만)를 생성해 서명된 단기 쿠키에 저장한 뒤 인가 URL로 리다이렉트한다.
3. 콜백 `/api/oauth/{provider}/callback`에서 `state`를 검증하고, 서버가 code를 토큰으로 교환한다.
4. access/refresh token을 AES-256-GCM으로 암호화해 `oauth_token`(Supabase DB)에 저장한다. 키는 Vercel 환경 변수(Sensitive)에 둔다. DB와 키를 서로 다른 서비스에 두어, 한쪽만 유출되면 토큰을 풀 수 없게 한다.

### 서비스별 토큰 특성 (공식 문서 기준)
| 서비스 | Access Token | Refresh Token | 주의점 |
|---|---|---|---|
| NAVER WORKS | 1시간 또는 24시간(콘솔 설정) | 90일 | Rotation이 On이면 갱신할 때마다 새 refresh token이 발급된다. 90일 안에 갱신해야 한다. |
| Google (Apps Script) | 해당 없음 | 해당 없음 | OAuth 토큰을 서버가 보관하지 않는다. 스크립트 소유자(본인)가 최초 실행 시 한 번 권한을 승인한다. 서버는 웹 앱 URL과 `SHARED_SECRET`만 가진다. Google 계정에서 스크립트 권한을 취소하면 브리지가 멈추므로, 연속 실패 시 "재승인 필요"를 표시한다. |
| GitHub (대시보드 로그인) | 로그인 시에만 사용 | 저장 안 함 | 로그인할 때 사용자 ID만 확인하고 토큰은 저장하지 않는다. 필요한 scope는 없다(공개 프로필만 읽음). |
| Notion (Internal, **확정**) | 정적 토큰 | 없음 | OAuth 흐름이 없다. Vercel 환경 변수(Sensitive)에 보관하고 설정 화면에는 연결 상태만 표시한다. |

### 갱신 전략
- 호출 직전에 만료 5분 전이면 선제 갱신한다. 401 응답 시 1회 갱신 후 재시도한다.
- 동시 갱신 경쟁 방지: `SELECT ... FOR UPDATE`(또는 advisory lock)로 토큰 행을 잠근 뒤 갱신한다. Rotation 환경에서 이전 refresh token을 두 번 쓰는 사고를 막는다.
- 갱신 실패(`invalid_grant` 등) 시 `connection.status = reauth_required`로 바꾸고 화면에 알린다. 재시도하지 않는다.
- NAVER WORKS refresh token 90일 만료 대비: 스케줄러가 매일 1회 이상 갱신하므로 사용 중에는 만료되지 않는다. 만료 14일 전 경고도 둔다.

## 7. 스케줄러와 오류 재시도

### 작업 구성 (D-07 확정, tick 방식)
Supabase Cron에는 작업 1개만 등록한다. 이 작업이 5분마다 `/api/jobs/tick`을 호출하면, 서버가 `sync_state.next_run_at`을 보고 실행할 소스를 고른다.

| 소스 | 주기 | 비고 |
|---|---|---|
| mail | 10분 (평일 07~21시 KST), 그 외 60분 | 시간대 판단은 서버가 Asia/Seoul 기준으로 한다. |
| calendar | 15분 | Apps Script `listEvents` 기간 창 전체 비교 |
| notion | 30분 | last_edited_time 비교 |
| maintenance | 매일 03:00 KST 이후 첫 tick | 토큰 만료 점검, 보존 기간이 지난 데이터 정리, 실패 작업 요약 |

- 한 번의 tick에서 기한이 된 소스를 순서대로 실행하고, 전체 240초 예산을 넘기면 다음 tick으로 미룬다.
- 보조 점검: Vercel Cron(하루 1회)이 `/api/jobs/heartbeat`를 호출한다. 마지막 tick이 30분 이상 없으면 Supabase Cron이 멈춘 것으로 보고 대시보드에 경고를 띄운다.
- Supabase Cron 호출의 Bearer 값(`CRON_SECRET`)은 Supabase Vault에 보관하고 cron SQL에 평문으로 쓰지 않는다(Vault 연동 방식은 검증 필요).

### 실행 보장
- 중복 실행 방지: `sync_run`에 소스별 실행 잠금(lease, 만료 시각 포함)을 둔다. 이전 실행이 진행 중이면 건너뛴다.
- 멱등성: 외부 ID(mailId, 캘린더 일정 iCalUID + 시작 시각, Notion page id)로 upsert한다.
- 커서 저장: 성공한 페이지까지 커서와 최신 시각을 저장해 중간 실패 후 이어서 실행한다.

### 재시도 정책
| 오류 | 처리 |
|---|---|
| 429 | `Retry-After` 또는 `rateLimit-reset`만큼 대기. 없으면 지수 백오프(1s, 2s, 4s, 8s, 16s, ±지터, 최대 5회). 대기 시간이 남은 실행 예산을 넘으면 기다리지 않고 `next_run_at`을 그 이후로 미룬다(함수 300초 제한). |
| 500/502/503/504, 529, 네트워크 오류 | GET 등 멱등 요청만 백오프 재시도. 쓰기 요청은 재시도하지 않고 사용자에게 결과 확인을 요청한다. |
| 401 | 토큰 1회 갱신 후 재시도. 다시 실패하면 reauth_required |
| 400/403/404 | 재시도하지 않는다. 오류를 기록하고 해당 항목만 건너뛴다. |
| Notion `public_api_request_blocked` | 재시도하지 않는다. |
| 작업 단위 실패 | 다음 스케줄에서 커서부터 재개. 연속 3회 실패하면 대시보드 상단에 경고 |

## 8. 화면 구성과 사용자 흐름

### 화면 목록
1. **오늘** (홈): 상단 `20261016 (금)`과 이전/다음 버튼, 날짜 선택
   - 일정 타임라인(오늘), 중요 메일 상위 5개(긴급·중요), 오늘 날짜의 회의록 카드, 연동 상태 배지
2. **일정**: 일/주 보기, 일정 상세, 새 일정 만들기 버튼, 수정 시트, 삭제 확인 대화상자
3. **메일**: 탭(긴급, 중요, 일반, 낮음, 전체), 각 항목에 분류 근거 칩과 "등급 변경" 메뉴, "NAVER WORKS에서 열기"
4. **회의록**: 날짜 목록(`YYYYMMDD` 내림차순, 검색), 본문 뷰어, "Notion에서 열기", "날짜 미확인" 목록
5. **설정**: 연동 연결/해제/재연결, 마지막 동기화와 오류 로그, 메일 분류 규칙(VIP, 키워드, 가중치), 동기화 주기 표시

### 레이아웃
| 환경 | 폭 | 구성 |
|---|---|---|
| iPad mini 세로 | 약 744px | 1열, 하단 탭 바(오늘/일정/메일/회의록/설정) |
| iPad mini 가로 | 약 1133px | 2열(일정 \| 메일+회의록), 좌측 내비게이션 |
| Windows PC | 1280px 이상 | 3열(일정 \| 메일 \| 회의록), 좌측 내비게이션 |

- 터치 대상 최소 44×44px. iPad Safari에서 hover에 의존하는 동작은 쓰지 않는다.
- PWA(홈 화면에 추가) 지원은 2차로 한다.

### 주요 흐름
- 최초 설정: GitHub 로그인 → 설정 → 캘린더 브리지 상태 확인(웹 앱 URL과 비밀값은 환경 변수로 미리 등록) → Notion 연결 상태 확인 → NAVER WORKS 연결 → 첫 동기화 → 오늘 화면
- 일정 추가: 일정 → 새 일정 → 입력(날짜는 YYYYMMDD 선택기, 쓰기 허용 캘린더만 선택 가능) → 저장 → 서버가 Apps Script 브리지로 생성 요청 → 성공 시 목록 반영, 실패 시 오류와 재시도 버튼
- 메일 분류 보정: 메일 → 항목의 "등급 변경" → 선택 → `mail_feedback` 저장 → 같은 발신자 규칙 제안
- 재인증: 상태 배지 "재연결 필요" → 설정 → 재연결

## 9. 검증이 필요한 사항
- 메일 목록의 정렬 순서와 HTTP 204 반환 조건
- Apps Script 웹 앱: 접근 권한 옵션 이름, POST 리다이렉트 처리, 배포 갱신 시 URL 유지, 응답 시간, 단일 일정을 ID로 다시 찾는 방법
- Vercel Hobby에서 함수 기본 리전을 `icn1`로 바꿀 수 있는지(대시보드 설정에서 확인)
- Supabase Cron의 HTTP 호출 방식(pg_net 사용 여부)과 Vault 비밀 참조 방법
- Vercel 함수에서 Supabase 연결 풀러 접속 방식(트랜잭션 모드, prepared statement 제약)
- Supabase Free 일시정지 기준이 5분 tick으로 충분한지(운영하면서 경고 메일 여부 관찰)
- Notion Search API를 보조 수단으로 쓸 때의 완전성

## 10. 의사결정 사항
- 확정(20261016): D-01 GitHub + Vercel Hobby(icn1) + Supabase Cron, D-09 Supabase Free(서울), D-02 규칙 기반 분류, D-07 동기화 주기, D-10 Next.js, D-05/D-06/D-11 Apps Script 캘린더 브리지와 GitHub 로그인. 상세 내용은 requirements.md 4-1절에 있다.
- 남은 결정: 없음. 운영 중 Vercel 상업적 용도 판단이 바뀌거나 무료 한도를 넘으면 Vercel Pro / Supabase Pro 전환을 검토한다.
