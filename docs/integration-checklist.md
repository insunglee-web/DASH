# 외부 연동 검증 체크리스트

- 작성일: 20261016
- 표기: ✅ 공식 문서로 확인 / ⚠️ 문서에 없거나 불명확(검증 필요) / ❓ 사용자 확인 필요
- 이번 단계에서는 어떤 서비스에도 실제로 연결하지 않았다. 아래 내용은 모두 공식 문서를 읽고 정리한 결과다.

## 1. NAVER WORKS 메일

### 1-1. 공식 문서로 확인한 사항
| 항목 | 내용 | 출처 |
|---|---|---|
| ✅ 메일 API 존재 | 메일함 목록, 메일 목록, 검색, 읽기, 안 읽은 수, 첨부 다운로드(읽기 계열)와 발송, 삭제, 이동, 읽음 표시, 메일함·자동 분류 관리(쓰기 계열) | developers.worksmobile.com/kr/docs/mail |
| ✅ scope | `mail`(읽기·쓰기), `mail.read`(읽기). **이 프로젝트는 `mail.read`만 요청한다.** | 같은 문서 |
| ✅ 인증 방식 | **User Account(구성원 계정) 토큰만 가능**하다. Service Account 토큰은 사용할 수 없다. | 같은 문서 |
| ✅ 메일 목록 API | `GET https://www.worksapis.com/v1.0/users/{userId}/mail/mailfolders/{folderId}/children`. `count` 5~200(기본 30), `cursor`, `searchFilterType`(all/mark/attach/tome), `isUnread` | /kr/docs/mail-folder-mail-list |
| ✅ 목록 응답 필드 | mailId, folderId, status(Read/Unread), from, to, subject, receivedTime, sentTime, size, isImportant, securityLevel, attachCount, unreadCount, nextCursor. **본문은 없다.** | 같은 문서 |
| ✅ 제약 | 수신확인 메일함은 조회할 수 없다. | 같은 문서 |
| ✅ 메일 읽기 API | `GET .../mail/{mailId}`로 본문, cc/bcc, 첨부 정보, 스레드를 조회한다. | /kr/docs/mail-get |
| ✅ OAuth 엔드포인트 | authorize: `https://auth.worksmobile.com/oauth2/v2.0/authorize`, token: `.../token`, revoke: `.../revoke`. `state` 필수 | /kr/docs/auth-oauth |
| ✅ 토큰 수명 | Authorization code 10분(1회용), Access Token 1시간 또는 24시간(콘솔 설정), **Refresh Token 90일** | 같은 문서 |
| ✅ Refresh Token Rotation | On이면 갱신할 때 새 refresh token이 발급된다(client_id+계정당 최대 100개 유지). | 같은 문서 |
| ✅ 호출 제한 | 코어 Free: API당 분당 60회. Lite/Standard/Standard Plus: **API당 분당 240회**. **동시 요청 5개**. 초과 시 HTTP 429 `TOO_MANY_REQUESTS` | /kr/docs/rate-limits |
| ✅ 호출량 헤더 | `rateLimit-limit`, `rateLimit-remaining`, `rateLimit-reset`(초), 사용량 헤더(문서 표기가 `rateLimit-ssed`로 되어 있어 오타로 보임) | 같은 문서 |
| ✅ 앱 사용 승인 | 관리자가 Admin > Apps에서 앱을 추가하고 사용할 구성원을 지정해야 한다. 구성원 신청을 관리자가 승인하는 흐름이 있다. | help.worksmobile.com 관리자 가이드(Apps) |
| ✅ 요금제와 메일 | 공식 도움말에 따르면 메일 기능은 코어 **Standard / Standard Plus** 플랜 신청 후 사용할 수 있다. | help.worksmobile.com 메일 가이드 |

### 1-2. 검증이 필요한 사항
| 항목 | 이유 | 검증 방법 |
|---|---|---|
| ⚠️ 메일 API 자체의 요금제 제한 | 문서상 플랜별 호출 한도만 있고, "메일 API는 어느 플랜부터"라는 명시 문구는 찾지 못했다. 메일 기능이 Standard 이상이므로 사실상 Standard 이상이 필요할 것으로 **추정**한다. | 회사 플랜 확인 후, 테스트 앱에서 `GET /users/me/mail/mailfolders` 1회 호출 |
| ⚠️ 메일 API에 적용되는 정확한 호출 한도 | 표는 상품 단위로만 되어 있다. | 응답 헤더 `rateLimit-limit` 확인 |
| ⚠️ 호출 한도 적용 단위 | 커뮤니티 답변(비공식)은 도메인(회사) 단위라고 한다. 회사의 다른 연동과 한도를 공유할 수 있다. | IT 관리자 확인, 응답 헤더 관찰 |
| ⚠️ 메일 읽기 시 읽음 처리 여부 | 문서에 없다. 본문 조회가 읽음 상태를 바꾸면 "실제 메일을 수정하지 않는다"는 제약에 걸린다. | 본인에게 보낸 테스트 메일 1건으로만 확인 |
| ⚠️ Developer Console 앱 생성 권한 | 일반 구성원이 OAuth 앱을 직접 만들 수 있는지 문서에서 확인하지 못했다. | IT 관리자 확인 |
| ⚠️ 목록 정렬 순서, HTTP 204 조건 | 문서에 없다. | 테스트 호출 |
| ⚠️ 웹 메일 딥링크 형식 | 문서에 없다. | 웹 메일 URL 확인 |
| ⚠️ Redirect URL 제약 | HTTPS 필수 여부, localhost 허용 여부 | 콘솔에서 확인 |

### 1-3. 사용자 / 회사 확인 필요
- ✅ 회사 NAVER WORKS 플랜: **Standard**(사용자 확인 20261016). 응답 헤더 `rateLimit-limit` = 240이 예상값이다.
- ❓ 앱 등록·승인 진행 상태 → 1-4절 절차
- ✅ 메일 메타데이터 외부 저장: 사용자 확인 완료(20261016, requirements.md C-13)

### 1-4. 플랜과 앱 승인 확인 방법 (20261016 추가)

**A. 일반 구성원이 바로 할 수 있는 1차 확인**
- 지금 NAVER WORKS **회사 메일을 쓰고 있다면** Standard 이상일 가능성이 매우 높다. 공식 도움말에 메일 기능은 Standard / Standard Plus 플랜 신청 후 사용할 수 있다고 되어 있기 때문이다.
- 단, 이는 메일 *기능* 기준의 추론이다. 메일 *API*의 플랜 조건은 문서에 명시되어 있지 않으므로 B나 C로 확정한다.

**B. 관리자(또는 관리자에게 요청)**
- 관리자 화면 → 구매 관리 → 이용 현황에서 상품과 플랜을 확인한다. 공식 도움말 기준이며, 메뉴 이름은 실제 화면에서 다시 확인해야 한다.

**C. 실제 API 호출로 확정 (2단계 PoC 1번)**
- 승인된 앱으로 `GET /users/me/mail/mailfolders`를 1회 호출한다. 200이면 사용 가능하다. 응답 헤더 `rateLimit-limit`가 240이면 유료 플랜(Lite 이상), 60이면 Free 한도다.

**앱 등록·승인 절차**
1. developers.worksmobile.com 로그인 → Console → 앱 생성(OAuth 연동). 메뉴가 없거나 권한 오류가 나면 관리자 권한이 필요한 것이다.
2. Client ID/Secret 확인, Redirect URL 등록(개발용 `http://localhost:3000/api/oauth/naverworks/callback`. localhost 허용 여부는 검증 필요), OAuth scope `mail.read`만 선택
3. 토큰 설정: Access Token 1시간, Refresh Token Rotation On(권장)
4. 관리자: Admin → Apps에서 앱 추가 → 접근 권한 검토 → 사용 구성원으로 본인만 지정
5. 운영 배포 후 운영 Redirect URL을 추가 등록한다.
- 관리자에게 전달할 내용: 앱 목적(개인 대시보드), scope `mail.read`(읽기 전용), 사용자 본인 1명, 메일 발송·삭제·이동 기능 없음

## 2. Google Calendar

> 20261016 변경: Google Cloud Console이 카드 등록을 요구해서 사용자가 쓰지 않기로 했다(C-16). Calendar REST API + OAuth 클라이언트 방식은 버리고 **Google Apps Script 웹 앱 브리지**(D-11)로 바꿨다. 이전에 정리한 REST API scope, refresh token 7일 만료, In production 전환 내용은 더 이상 적용되지 않는다.

### 2-1. 공식 문서로 확인한 사항 (Apps Script)
| 항목 | 내용 |
|---|---|
| ✅ 기본 Cloud 프로젝트 | Apps Script 프로젝트를 만들면 기본 Cloud 프로젝트가 백그라운드에서 자동으로 생성된다. 대부분의 사용자는 Cloud Console에서 이를 보거나 편집할 수 없고, 간단한 스크립트는 신경 쓸 필요가 없다. |
| ✅ 웹 앱 | `doGet(e)` / `doPost(e)`로 요청을 처리한다. `e.parameter`, `e.postData` 등을 받는다. `ContentService`로 JSON을 반환한다. "나로 실행"이면 스크립트 소유자 권한으로 실행된다. `c`, `sid` 파라미터는 예약어다. |
| ✅ CalendarApp 메서드 | 조회 `getEvents`, 생성 `createEvent`/`createAllDayEvent`, 캘린더 `getCalendarById`/`getAllOwnedCalendars`, 일정 수정 `setTitle`/`setTime`/`setAllDayDate`/`setLocation`/`setDescription`, 삭제 `deleteEvent`, `getId`(iCalUID), `getLastUpdated` |
| ✅ 필요 scope | 생성·삭제에 `https://www.googleapis.com/auth/calendar`가 필요하다. `appsscript.json`의 `oauthScopes`로 명시하는 것이 권장된다(웹 앱은 자동 감지에만 의존하지 말 것). |
| ✅ 한도(일반 Gmail) | 일정 생성 하루 5,000건, 실행당 6분, 사용자당 동시 실행 30개, URL Fetch 하루 20,000회 |
| ✅ 제한 scope 사용 | 비공개(본인용) 앱은 민감·제한 scope를 자유롭게 쓸 수 있다. 공개 배포할 때만 검증이 필요하다. |

### 2-2. 검증이 필요한 사항
| 항목 | 내용 |
|---|---|
| ⚠️ 카드 없이 생성되는지 | Apps Script 결제 요구에 대한 문서 언급은 찾지 못했다. 사용자가 script.google.com에서 프로젝트를 만들 때 확인한다. |
| ⚠️ 웹 앱 접근 권한 옵션 | "모든 사용자(Anyone)" 옵션 이름과 동작은 이번에 본 문서에 없었다. 배포 화면에서 확인한다. |
| ⚠️ POST 리다이렉트 | 웹 앱 응답이 다른 도메인으로 리다이렉트되는지, 서버 fetch가 그대로 결과를 받는지 확인한다. |
| ⚠️ 배포 갱신 시 URL 유지 | 기존 배포를 새 버전으로 갱신하면 URL이 유지되는지 확인한다. |
| ⚠️ 단일 일정 재조회 | 수정·삭제할 때 iCalUID로 일정을 다시 찾는 방법(`getEventById` 등)을 확인한다. |
| ⚠️ 첫 승인 화면 | "확인되지 않은 앱" 경고가 나오는지, 통과 절차를 확인한다. |
| ⚠️ 응답 시간 | 브리지 1회 호출의 지연 시간을 측정한다(화면 UX에 영향). |

### 2-3. 사용자 확인 결과 (20261016)
- ✅ 개인 Gmail
- ✅ Google Cloud Console 미사용(C-16) → Apps Script 브리지
- ✅ 쓰기 테스트 캘린더: **블루캐니언워터파크**(C-18)
- ✅ 블루캐니언워터파크 캘린더는 사용자 혼자 쓰는 캘린더다(20261016). 테스트 일정이 다른 사람에게 보이지 않는다. 기존 일정 보호 규칙(2-4절)은 그대로 지킨다.

### 2-4. 블루캐니언워터파크 캘린더 테스트 규칙
1. `WRITE_CALENDAR_IDS`에는 이 캘린더 ID 하나만 넣는다.
2. 테스트 일정 제목은 `[테스트]`로 시작하고, 아무 일정도 없는 날짜(예: 과거나 먼 미래의 빈 날)를 쓴다.
3. 게스트를 추가하지 않는다(초대 메일 방지).
4. 기존 일정은 **수정·삭제하지 않는다.** 수정·삭제 테스트는 방금 만든 `[테스트]` 일정에만 한다.
5. 테스트가 끝나면 `[테스트]` 일정이 남아 있지 않은지 확인한다.

### 2-5. Apps Script 준비 절차 (사용자, 카드 등록 불필요 예상)
1. 본인 Gmail로 https://script.google.com → 새 프로젝트 → 이름 `dashboard-calendar-bridge`
2. 코드는 2단계에서 제공한다(붙여넣기만 하면 됨).
3. 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 체크
4. 프로젝트 설정 → 스크립트 속성에 `SHARED_SECRET`, `READ_CALENDAR_IDS`, `WRITE_CALENDAR_IDS` 입력(값은 대화에 붙여넣지 않음)
5. 배포 → 새 배포 → 웹 앱, 실행 사용자 "나", 접근 권한 "모든 사용자" → 권한 승인 → 웹 앱 URL 복사
6. 웹 앱 URL과 `SHARED_SECRET`을 Vercel 환경 변수(Sensitive)와 로컬 `.env.local`에 입력

## 3. Notion

### 3-1. 공식 문서로 확인한 사항
| 항목 | 내용 |
|---|---|
| ✅ 블록 자식 조회 | `GET /v1/blocks/{block_id}/children`. **첫 단계 자식만** 반환하므로 `has_children`을 보고 재귀 조회해야 한다. `start_cursor` / `next_cursor` / `has_more`로 페이지네이션한다. |
| ✅ 필요 권한 | Read content capability. 없으면 403 |
| ✅ 미지원 블록 | `type: "unsupported"`로 반환된다(`unsupported.block_type`에 원래 타입). |
| ✅ 호출 제한 | 평균 초당 3회(분당 180회). Business/Enterprise는 초당 10회(분당 600회). 워크스페이스 공용 한도가 별도로 있다. 429 `rate_limited`이면 `Retry-After`를 따른다. |
| ✅ 재시도 규칙 | 529도 429처럼 재시도한다. 500/502/503/504는 멱등 요청만 재시도한다. `public_api_request_blocked`는 재시도하지 않는다. |
| ✅ 연결 방식 | Internal connection(정적 토큰, **워크스페이스 owner만 생성 가능**, 페이지 ••• > Add connections로 공유) / Public connection(OAuth, page picker로 페이지 선택, refresh token 있음, 갱신하면 둘 다 새로 발급) / Personal access token |
| ✅ 버전 헤더 | `Notion-Version` 필수. 문서상 현재값은 `2026-03-11` |
| ✅ 쓰기 요청 크기 제한 | 요청당 블록 100개, rich text 2,000자(이 프로젝트는 쓰기를 하지 않는다) |

### 3-2. 검증이 필요한 사항
| 항목 | 내용 |
|---|---|
| ⚠️ child_page 블록의 title 필드 | 날짜 추출의 핵심이다. 테스트 페이지로 응답 구조를 확인한다. |
| ✅ 상위 페이지만 공유했을 때 하위 페이지 접근 | 상위 페이지에 권한을 주면 하위 페이지에도 상속된다(Internal connections 공식 가이드, 20261016 확인). |
| ✅ PAT와 Internal connection 차이 | PAT는 만든 사용자 본인으로 동작해 그 사람이 볼 수 있는 모든 페이지에 접근한다. Internal connection은 별도 bot으로 동작하고 연결한 페이지만 볼 수 있다 → Internal connection 유지 |
| ⚠️ API 버전 변경 영향 | 데이터베이스 관련 변경(data source 도입 등)은 이 프로젝트와 무관할 가능성이 높지만, 페이지·블록 응답에 차이가 있는지 확인한다. |

### 3-3. 사용자 확인 결과 (20261016)
- ✅ 상위 페이지: 기존 **「놀발 업무일지 및 미팅록」**(새 페이지를 만들지 않는다). 공유 링크의 ID `39dfa7ab-52b6-80c9-9e08-db79b4afe378`가 이 페이지인지 PoC에서 확인
- ✅ 제목 예시 `20260709 목`, `20260710 금`, `20260906 사업계획` → 정규식 `^\s*(\d{8})(?:\s+(.+))?$` 후 실제 날짜인지 검증
- ✅ 워크스페이스 owner → Internal connection 사용, 기본 플랜 → 초당 3회
- ❓ 연/월 중간 페이지 여부(V-06) → PoC 7번에서 확인
- 이번 단계에서는 제약에 따라 이 페이지를 실제로 조회하지 않았다.

**Internal connection 준비 절차** (페이지를 새로 만드는 것이 아니라 API 접속 열쇠를 만드는 것이다)
1. https://app.notion.com/developers/connections → 사이드바 Build → **Internal connections** → **Create a new connection** → 이름(예: `개인 대시보드`) 입력, 워크스페이스 선택(owner만 가능)
2. **Configuration** 탭: 콘텐츠 읽기만 켜고 콘텐츠 수정·삽입, 사용자 정보 읽기는 끈다. 같은 탭에 API 토큰이 표시된다.
3. 접근 권한 부여(둘 중 하나):
   - 개발자 포털 **Content access** 탭 → **Edit access** → 「놀발 업무일지 및 미팅록」 선택
   - 또는 「놀발 업무일지 및 미팅록」 페이지 우측 상단 ••• → **Connections** → **+ Add connection** → `개인 대시보드` 검색해 추가
   - 하위 페이지(날짜별 회의록)에는 권한이 자동으로 상속된다.
4. 발급된 토큰은 대화나 코드에 붙여넣지 말고, 2단계에서 `.env.local`(로컬) 또는 Vercel 환경 변수(운영, Sensitive)에 직접 입력한다.

## 4. PoC 검증 계획 (2단계 시작 시, 운영 데이터에 쓰기 금지)

| 순서 | 검증 | 사용 데이터 | 성공 기준 |
|---|---|---|---|
| 1 | NAVER WORKS 메일함 목록 조회 | 본인 계정, `mail.read`만 | 200 응답, 받은메일함 folderId 확인, rateLimit 헤더 기록 |
| 2 | 메일 목록 조회 1페이지(count=5) | 본인 받은메일함 | 필드 구조와 정렬 순서 확인 |
| 3 | 읽음 처리 부작용 확인 | 본인에게 보낸 테스트 메일 1건 | 상세 조회 전후 status 비교 |
| 4 | 토큰 갱신(Rotation On/Off) | 테스트 앱 | 새 refresh token 저장, 이전 토큰 무효 확인 |
| 5 | Apps Script 브리지 조회 | 읽기 허용 캘린더(`listCalendars`, `listEvents`) | 서명 검증 통과, 잘못된 서명·만료된 ts 거부, 응답 시간 기록 |
| 6 | Apps Script 일정 생성·수정·삭제 | **블루캐니언워터파크** 캘린더, `[테스트]` 일정만(2-4절) | CRUD 성공, 수정 시각 충돌 감지, 허용 목록 밖 캘린더 쓰기 거부, 테스트 일정 잔존 0건 |
| 7 | Notion 상위 페이지 하위 목록 | 회의록 상위 페이지(읽기) | 제목에서 날짜 추출 성공률 확인 |
| 8 | Notion 본문 재귀 조회 | 회의록 3건 | 렌더링, unsupported 처리 |

## 5. 배포 플랫폼 (D-01, D-09 확정 20261016)

| 항목 | 상태 | 내용 |
|---|---|---|
| Vercel Hobby Cron | ✅ | 하루 1회만 가능, ±59분 오차 → heartbeat 전용 |
| Vercel 함수 실행 시간 | ✅ | Hobby 최대 300초 |
| Vercel 서울 리전 | ✅ | `icn1` 존재 / ⚠️ Hobby에서 기본 함수 리전을 변경할 수 있는지 확인 |
| Vercel Hobby 용도 제한 | ✅ | 비상업적 개인 용도만 허용 → 사용자 판단으로 개인 용도 |
| Supabase 서울 리전 | ✅ | `ap-northeast-2` |
| Supabase Free 한도 | ✅ | 프로젝트 2개, DB 500MB / ⚠️ 일시정지 기준 수치 비공개 |
| Supabase Cron | ✅ | 초 단위 주기와 HTTP 요청 가능 / ⚠️ Free 플랜 사용 가능 여부, Vault 비밀 참조 방법 |
| 배포 계정 | ✅ | GitHub `insunglee-web`, Vercel `holden9` |
| 대시보드 로그인 | ✅ | GitHub OAuth App(카드 불필요). Google OAuth는 쓰지 않으므로 `*.vercel.app` redirect 문제는 없어졌다. GitHub OAuth App의 callback URL에 로컬과 운영 주소를 각각 등록한다(App 하나에 callback 하나만 허용될 수 있어 개발용/운영용 App을 따로 만든다. 검증 필요). |

## 6. 참고 출처
- NAVER WORKS Mail API: https://developers.worksmobile.com/kr/docs/mail
- 메일 목록 조회: https://developers.worksmobile.com/kr/docs/mail-folder-mail-list
- 메일 읽기: https://developers.worksmobile.com/kr/docs/mail-get
- User Account 인증: https://developers.worksmobile.com/kr/docs/auth-oauth
- 인증 개요: https://developers.worksmobile.com/kr/docs/auth
- Rate Limits: https://developers.worksmobile.com/kr/docs/rate-limits
- NAVER WORKS 메일 도움말: https://help.worksmobile.com/ko/use-guides/mail/overview/
- NAVER WORKS Apps 관리: https://help.worksmobile.com/en/admin-guides/apps/app-requests/
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
- Google Cloud 도움말 Unverified apps: https://support.google.com/cloud/answer/7454865
- NAVER WORKS 이용 현황(구매 관리): https://help.worksmobile.com/ko/admin-guides/purchase-management/usage-status/
- Google Calendar scopes: https://developers.google.com/workspace/calendar/api/auth
- Google Calendar events.watch: https://developers.google.com/workspace/calendar/api/v3/reference/events/watch
- Notion request limits: https://developers.notion.com/reference/request-limits
- Notion block children: https://developers.notion.com/reference/get-block-children
- Notion authorization: https://developers.notion.com/docs/authorization
- Apps Script 웹 앱: https://developers.google.com/apps-script/guides/web
- Apps Script 한도: https://developers.google.com/apps-script/guides/services/quotas
- Apps Script 기본 Cloud 프로젝트: https://developers.google.com/apps-script/guides/cloud-platform-projects
- Apps Script scope 설정: https://developers.google.com/apps-script/concepts/scopes
- CalendarApp: https://developers.google.com/apps-script/reference/calendar/calendar-app
- CalendarEvent: https://developers.google.com/apps-script/reference/calendar/calendar-event
- Notion Internal connections: https://developers.notion.com/guides/get-started/internal-connections.md
- Vercel Cron 요금·제한: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Fair Use(상업적 용도 정의): https://vercel.com/docs/limits/fair-use-guidelines
- Vercel 함수 제한: https://vercel.com/docs/functions/limitations
- Vercel 리전: https://vercel.com/docs/regions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase 요금: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase 리전: https://supabase.com/docs/guides/platform/regions
- Supabase 일시정지: https://supabase.com/docs/guides/platform/free-project-pausing
