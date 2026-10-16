# Google Calendar 브리지 배포 방법

Google Cloud Console 없이, 본인 Gmail 계정의 Apps Script로 캘린더를 읽고 씁니다(docs/architecture.md 4장).
비밀값은 대화창이나 코드에 붙여넣지 말고 아래 화면에만 직접 입력하세요.

## 1. 프로젝트 만들기

1. 본인 Gmail로 https://script.google.com 접속 → **새 프로젝트**
2. 프로젝트 이름: `dashboard-calendar-bridge`
3. 편집기의 `Code.gs`(또는 `코드.gs`)를 클릭 → **Ctrl+A로 기존 내용을 모두 지우고** 코드 전체를 붙여넣기 → **Ctrl+S 저장**
   - 코드 전체 복사 방법(둘 중 하나):
     - 이 PC에서 아래 명령을 실행하면 클립보드에 복사됩니다: `powershell -c "Get-Content -Raw -Encoding UTF8 apps-script\Code.gs | Set-Clipboard"`
     - 또는 https://raw.githubusercontent.com/insunglee-web/DASH/main/apps-script/Code.gs 를 열고 Ctrl+A → Ctrl+C
   - 파일은 `Code.gs` 하나만 있으면 됩니다. `appsscript.json`(매니페스트)은 **건드리지 않아도 됩니다**. 필요한 캘린더 권한은 Apps Script가 코드에서 자동으로 알아냅니다.
4. 설정(톱니바퀴) → "Chrome V8 런타임 사용"이 켜져 있는지 확인(기본값)

> 이 과정에서 카드 등록을 요구하는지 알려 주세요(문서상 필요 없는 것으로 보이지만 확인 전입니다).
> 저장할 때 오류가 나면 오류 문구와 줄 번호를 알려 주세요.

## 2. 권한 승인과 캘린더 ID 확인

1. 편집기 상단 함수 선택에서 **`setupCheck`** 선택 → **실행**
2. 처음 한 번 권한 승인 화면이 뜹니다. "확인되지 않은 앱" 경고가 나오면 **소유자가 본인 Gmail인지 확인**한 뒤 고급 → 이동 → 허용
3. 아래 **실행 로그**에 내 캘린더 이름과 ID가 표시됩니다. **블루캐니언워터파크** 캘린더 ID를 찾아 둡니다.

## 3. 스크립트 속성 입력

프로젝트 설정 → **스크립트 속성** → 속성 추가

| 속성 | 값 |
|---|---|
| `SHARED_SECRET` | `npm run secrets`가 출력한 `GAS_CALENDAR_SHARED_SECRET` 값 |
| `READ_CALENDAR_IDS` | 대시보드에 보여줄 캘린더 ID들(쉼표로 구분). 예: 기본 캘린더(본인 Gmail 주소) |
| `WRITE_CALENDAR_IDS` | 블루캐니언워터파크 캘린더 ID 하나만 |
| `TEST_MODE` | `true` (테스트가 끝날 때까지 유지) |

`setupCheck`를 다시 실행해 `SHARED_SECRET: 설정됨`, 쓰기 허용 캘린더 1개가 나오는지 확인합니다.

## 4. 웹 앱으로 배포

1. 오른쪽 위 **배포** → **새 배포** → 유형 **웹 앱**
2. 실행 사용자: **나**, 액세스 권한: **모든 사용자** (서버가 Google 로그인 없이 호출해야 하므로 필요. 모든 요청은 서명으로 검증합니다)
3. 배포 → **웹 앱 URL**(`https://script.google.com/macros/s/.../exec`) 복사
4. 이 URL을 `.env.local`의 `GAS_CALENDAR_WEBAPP_URL`에, 같은 비밀값을 `GAS_CALENDAR_SHARED_SECRET`에 넣습니다.

> 코드를 고친 뒤에는 **배포 관리 → 기존 배포 편집 → 새 버전**으로 갱신하세요. 새 배포를 만들면 URL이 바뀝니다.

## 안전장치

- 서명(HMAC-SHA256), 5분 시간 제한, 같은 요청 재사용 차단
- `READ_CALENDAR_IDS` / `WRITE_CALENDAR_IDS`에 없는 캘린더는 거부
- `TEST_MODE=true`이면 제목이 `[테스트]`로 시작하는 일정만 만들고, 고치고, 지움 → 기존 실제 일정은 건드릴 수 없음
- 반복 일정은 수정·삭제하지 않음, 게스트(참석자)는 추가하지 않음(초대 메일 없음)
- 다른 기기에서 먼저 수정된 일정은 충돌로 거부

## 끊는 방법

배포 관리에서 배포를 보관하고, Google 계정 → 보안 → 서드파티 액세스에서 이 스크립트의 권한을 삭제합니다.
