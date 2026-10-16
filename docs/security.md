# 보안 설계와 주의점

- 작성일: 20261016
- 위협 모델: 단일 사용자가 회사 메일 메타데이터, 개인·업무 일정, 회의록을 클라우드에 모아 보는 서비스다. 가장 큰 위험은 **토큰 유출**(세 서비스에 대한 지속적 접근 권한이 넘어감)과 **회사 데이터의 외부 반출**이다.

## 1. 확정된 원칙
1. 외부 API는 서버에서만 호출한다. 브라우저, 로그, 오류 메시지, URL에 토큰을 노출하지 않는다.
2. 최소 권한 scope만 요청한다.
   - NAVER WORKS: `mail.read`만 요청한다(`mail` 사용 금지).
   - Google: Apps Script 브리지는 `https://www.googleapis.com/auth/calendar`(전체) scope가 필요하다. scope가 넓으므로 **스크립트 코드의 허용 캘린더 목록(읽기/쓰기 분리)**으로 실제 접근을 제한한다(D-05, D-11).
   - 대시보드 로그인: GitHub OAuth App, scope 없음(공개 프로필만 읽음), 허용 계정 `insunglee-web`(D-06).
   - Notion: Read content만 허용한다. 회의록 상위 페이지만 공유한다.
3. 실제 계정 정보와 토큰은 코드, 저장소, 문서에 기록하지 않는다. `.env`는 저장소에 올리지 않는다(`.gitignore`). `.env.example`에는 키 이름만 둔다.
4. 이 단계에서는 운영 서비스에 연결하지 않고 실제 메일·일정을 수정하지 않는다.

## 2. 토큰 보관
- 저장: DB에는 AES-256-GCM 암호문만 저장한다(`oauth_token`). 레코드마다 랜덤 IV를 쓰고 `connection_id`를 AAD로 사용한다.
- 키 관리: 데이터 암호화 키는 Vercel 환경 변수에 Sensitive로 등록한다. Sensitive 변수는 등록 뒤 값을 다시 볼 수 없는 것으로 알려져 있다(검증 필요). DB(Supabase)와 키(Vercel)를 다른 서비스에 두어, 한쪽만 유출되면 토큰을 복호화할 수 없게 한다. `enc_key_version`으로 키를 교체할 수 있게 한다.
- 접근: 복호화는 서버 프로세스 메모리 안에서만 하고 캐시하지 않는다. 사용 후 참조를 버린다.
- 갱신: 행 잠금으로 동시 갱신을 막는다(Rotation 환경에서 refresh token 재사용 방지).
- 폐기: 연결 해제 시 provider의 revoke 엔드포인트를 호출하고(NAVER WORKS `/oauth2/v2.0/revoke`) DB에서 삭제한다. 캘린더 브리지를 끊으려면 Apps Script 배포를 보관(중지)하고, Google 계정의 서드파티 액세스에서 스크립트 권한을 취소한다.

## 3. 웹 애플리케이션 보안
| 항목 | 대책 |
|---|---|
| 로그인 | GitHub 로그인 + 허용 계정 1개. GitHub 사용자 이름은 바뀔 수 있으므로 **숫자 사용자 ID**로 비교한다. 이외 계정은 거부하고 기록한다. |
| Apps Script 브리지 | 웹 앱 URL은 누구나 호출할 수 있으므로 모든 요청에 HMAC 서명, 5분 시간 제한, nonce 재사용 차단을 적용한다. 비밀값은 Script Properties와 Vercel 환경 변수에만 둔다. 쓰기는 `WRITE_CALENDAR_IDS`의 캘린더로 제한하고 게스트 추가는 막는다(초대 메일 방지). 요청과 오류에 일정 내용을 남기지 않는다. |
| 세션 | HttpOnly, Secure, SameSite=Lax 쿠키, 유휴 만료(예: 12시간), 절대 만료(예: 7일) |
| CSRF | SameSite 쿠키 + 상태 변경 API에 CSRF 토큰 또는 Origin 검사 |
| OAuth 콜백 | `state` 검증 필수(NAVER WORKS 문서상 필수 파라미터), 가능한 곳은 PKCE, redirect URI 정확히 일치 |
| 작업 엔드포인트 | `/api/jobs/*`는 `Authorization: Bearer <CRON_SECRET>`을 상수 시간 비교로 검증해야만 실행한다. CRON_SECRET은 32바이트 이상 랜덤값이다. Vercel 환경 변수와 Supabase Vault에만 보관하고 주기적으로 교체한다. 같은 tick이 중복으로 들어와도 실행 잠금으로 막는다. |
| Supabase 노출면 | Supabase 프로젝트는 기본적으로 Data API(PostgREST)를 공개 주소로 제공한다. 이 앱은 Data API를 쓰지 않으므로 **Data API를 끄거나, 모든 테이블에 RLS를 켜고 정책을 두지 않아** anon/authenticated 키로는 아무것도 읽을 수 없게 한다. anon/service_role 키는 앱에 넣지 않는다. 앱 테이블은 별도 스키마(예: `app`)에 둔다. |
| DB 접속 | Vercel 함수는 Supabase 연결 풀러로 SSL 접속한다. DB 비밀번호는 강한 랜덤값으로 하고 Vercel 환경 변수에만 둔다. |
| XSS | Notion 블록과 메일 제목을 렌더링할 때 HTML을 직접 삽입하지 않는다. 텍스트는 이스케이프하고 링크는 http/https만 허용한다. |
| 보안 헤더 | CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors 'none' |
| 쓰기 작업 | Google 일정 삭제는 확인 대화상자를 거치고 감사 로그에 남긴다. 대량 수정·삭제 기능은 만들지 않는다. |
| 의존성 | lockfile 고정, 정기 취약점 점검(npm audit 등) |

## 4. 로그와 개인정보
- 로그에 남기지 않는 것: 토큰, Authorization 헤더, 메일 본문, 메일 제목 전체, 일정 상세 설명
- 오류 로그: provider, HTTP 상태, 오류 코드, 요청 ID만 남긴다.
- 메일은 메타데이터만 저장한다(D-03). 보존 기간이 지나면 자동 삭제한다(D-08).
- 백업: Supabase Free의 백업 제공 범위는 확인하지 못했다(검증 필요). 이 DB는 외부 서비스의 캐시라서 유실돼도 다시 동기화하면 복구된다. 다시 만들 수 없는 데이터(메일 분류 규칙, 보정 이력, 설정)만 설정 화면에서 JSON으로 내보낼 수 있게 한다.

## 5. 회사 데이터 관련 주의점 (중요)
- NAVER WORKS는 회사 계정이다. 메일 메타데이터를 클라우드에 저장하는 것은 사용자가 허용했다(20261016). 그래도 발신자 이메일과 이름은 개인정보이므로 암호화 저장, 보존 기간, 접근 통제는 그대로 적용한다.
- Apps Script를 처음 실행할 때 Google이 "확인되지 않은 앱" 경고를 보여줄 수 있다. 본인이 만든 스크립트(소유자가 본인 Gmail)인지 확인한 뒤에만 승인한다.
- 블루캐니언워터파크 캘린더를 테스트에 쓸 때: 사용자 혼자 쓰는 캘린더라 테스트 일정이 다른 사람에게 노출되지 않는다(20261016 확인). 그래도 제목을 `[테스트]`로 시작하고, 게스트를 추가하지 않으며, 검증이 끝나면 바로 삭제한다. 실제 영업 일정은 수정·삭제하지 않는다.
- **Notion 페이지 공개 링크 금지(20261016):** 사용자가 「놀발 업무일지 및 미팅록」에 "링크가 있는 모든 사람 편집 가능" 권한을 줬다. 이 페이지 ID는 공개 GitHub 저장소(`DASH`)의 문서와 `.env.example`에 적혀 있어서, 저장소를 본 누구나 회의록을 열고 **편집까지** 할 수 있게 된다. Internal connection은 공개 링크가 전혀 필요 없으므로 공유 설정에서 일반 액세스를 "초대된 사용자만"으로 되돌리고, 웹 게시(Publish)도 꺼야 한다.
- Notion Internal 토큰은 만료되지 않는다. 유출되면 연결된 페이지를 계속 읽을 수 있으므로 Read content 권한만 주고, 회의록 상위 페이지에만 연결한다. 의심되면 포털에서 즉시 재발급한다.
- 앱 등록과 승인에 관리자가 관여하므로, 처음부터 IT 담당자와 목적, scope(`mail.read`), 저장 범위를 공유하는 것이 안전하다.
- 메일 분류는 규칙 기반으로 확정했다(D-02). 외부 LLM에 메일 내용을 보내지 않는다. 나중에 도입하려면 회사 정책을 다시 확인해야 한다.
- 저장 위치: DB는 Supabase 서울(`ap-northeast-2`), 함수 실행은 Vercel 서울(`icn1`)이다. 단, Vercel 로그와 빌드는 해외 인프라에서 처리될 수 있으므로 로그에 개인정보를 남기지 않는다(4장).

## 6. 운영 보안
- GitHub, Vercel, Supabase, Google 계정 모두에 2단계 인증을 적용한다.
- GitHub 저장소는 **비공개**로 둔다. `.env*` 파일은 `.gitignore`에 넣는다. GitHub secret scanning / push protection을 켠다(비공개 저장소에서 쓸 수 있는지 검증 필요).
- Vercel 프로젝트 멤버는 본인 1명으로 둔다. Preview 배포에는 운영 비밀값을 넣지 않는다(환경 변수를 Production 전용으로 지정).
- Supabase 대시보드 접근은 본인만 가능하게 한다. DB 비밀번호와 CRON_SECRET은 노출이 의심되면 즉시 교체한다.
- 비밀 노출이 의심되면: 각 서비스 콘솔에서 Client Secret 재발급 → 모든 토큰 revoke → 암호화 키·DB 비밀번호·CRON_SECRET 교체 → 재연결

## 7. 검증이 필요한 사항
- NAVER WORKS OAuth의 PKCE 지원 여부(문서에서 확인하지 못함)
- Vercel Sensitive 환경 변수의 동작(등록 후 값 조회 불가 여부, Hobby에서 쓸 수 있는지)
- Supabase에서 Data API 끄는 방법과 RLS 기본값
- Supabase Free 백업 제공 범위
- Supabase Cron에서 Vault 비밀을 HTTP 헤더로 참조하는 방법

## 8. 의사결정 사항
- 확정(20261016): D-02 LLM 미사용, D-03 메타데이터만 저장, D-06 GitHub 로그인 + allowlist, D-11 Apps Script 캘린더 브리지, D-08 보존 기간(메일 90일, sync_run 30일, audit_log 1년)
- 확정(20261016): D-01 GitHub + Vercel Hobby(icn1) + Supabase Cron, D-09 Supabase Free(서울). 토큰 암호문은 Supabase에, 암호화 키는 Vercel에 분리해 보관한다.
- 남은 결정: 없음.
- NAVER WORKS 앱 승인 과정에서 관리자에게 목적과 scope를 공유하는 것을 권장한다.
