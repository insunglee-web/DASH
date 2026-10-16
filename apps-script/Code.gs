/**
 * 개인 업무 대시보드 — Google Calendar 브리지 (docs/architecture.md 4장, D-11)
 *
 * 대시보드 서버(Vercel)가 HMAC 서명한 POST 요청을 보내면, 이 스크립트가 본인 권한으로
 * Google Calendar를 조회·수정한다. Google Cloud Console이나 OAuth 클라이언트가 필요 없다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)
 *   SHARED_SECRET       대시보드의 GAS_CALENDAR_SHARED_SECRET과 같은 값 (32자 이상)
 *   READ_CALENDAR_IDS   읽기를 허용할 캘린더 ID, 쉼표로 구분
 *   WRITE_CALENDAR_IDS  쓰기를 허용할 캘린더 ID, 쉼표로 구분 (처음에는 블루캐니언워터파크만)
 *   TEST_MODE           "true"(기본)면 제목이 TEST_TITLE_PREFIX로 시작하는 일정만 만들고 고치고 지운다
 *   TEST_TITLE_PREFIX   기본 "[테스트]"
 *
 * 이 파일은 저장소의 apps-script/Code.gs가 원본이다. 고칠 때는 저장소에서 고친 뒤 붙여넣는다.
 */

var MAX_CLOCK_SKEW_SEC = 300;
var NONCE_TTL_SEC = 600;
var MAX_EVENTS = 1000;
var MAX_WINDOW_DAYS = 120;
var MAX_TITLE_LENGTH = 200;
var MAX_DESCRIPTION_LENGTH = 2000;
var DAY_MS = 24 * 60 * 60 * 1000;

function doPost(e) {
  var result;
  try {
    var request = parseRequest_(e);
    verifyRequest_(request);
    var params = request.params ? JSON.parse(request.params) : {};
    result = { ok: true, data: dispatch_(request.action, params) };
  } catch (err) {
    if (err && err.code) {
      result = { ok: false, error: { code: err.code, message: err.message } };
    } else {
      console.error('bridge internal error: ' + (err && err.message));
      result = { ok: false, error: { code: 'internal', message: '처리 중 오류가 발생했습니다.' } };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: { code: 'method_not_allowed', message: 'POST만 지원합니다.' } }),
  ).setMimeType(ContentService.MimeType.JSON);
}

// ── 요청 검증 ─────────────────────────────────────────

function bridgeError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function parseRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw bridgeError_('bad_request', '요청 본문이 없습니다.');
  }
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    throw bridgeError_('bad_request', '요청 본문이 JSON이 아닙니다.');
  }
  if (
    typeof body.action !== 'string' ||
    typeof body.params !== 'string' ||
    typeof body.ts !== 'number' ||
    typeof body.nonce !== 'string' ||
    body.nonce.length < 16 ||
    body.nonce.length > 128 ||
    typeof body.sig !== 'string'
  ) {
    throw bridgeError_('bad_request', '요청 형식이 올바르지 않습니다.');
  }
  return body;
}

/** 서명 대상 문자열. 서버(src/lib/gas/client.ts)의 canonicalString과 같아야 한다. */
function canonicalString_(request) {
  return [request.action, String(request.ts), request.nonce, request.params].join('\n');
}

function constantTimeEquals_(a, b) {
  var diff = a.length ^ b.length;
  var length = Math.max(a.length, b.length);
  for (var i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function verifyRequest_(request) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!secret || secret.length < 32) {
    throw bridgeError_('not_configured', 'SHARED_SECRET 스크립트 속성이 없거나 너무 짧습니다.');
  }
  var expected = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(canonicalString_(request), secret, Utilities.Charset.UTF_8),
  );
  if (!constantTimeEquals_(request.sig, expected)) {
    throw bridgeError_('unauthorized', '서명이 올바르지 않습니다.');
  }
  var nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - request.ts) > MAX_CLOCK_SKEW_SEC) {
    throw bridgeError_('expired', '요청 시각이 허용 범위를 벗어났습니다.');
  }
  var cache = CacheService.getScriptCache();
  var key = 'nonce:' + request.nonce;
  if (cache.get(key)) {
    throw bridgeError_('replay', '이미 처리한 요청입니다.');
  }
  cache.put(key, '1', NONCE_TTL_SEC);
}

// ── 설정과 허용 목록 ───────────────────────────────────

function splitIds_(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(function (id) {
      return id.trim();
    })
    .filter(function (id) {
      return id.length > 0;
    });
}

function config_() {
  var props = PropertiesService.getScriptProperties();
  var write = splitIds_(props.getProperty('WRITE_CALENDAR_IDS'));
  var read = splitIds_(props.getProperty('READ_CALENDAR_IDS'));
  write.forEach(function (id) {
    if (read.indexOf(id) < 0) read.push(id);
  });
  return {
    read: read,
    write: write,
    testMode: props.getProperty('TEST_MODE') !== 'false',
    testPrefix: props.getProperty('TEST_TITLE_PREFIX') || '[테스트]',
  };
}

function getCalendar_(cfg, calendarId, forWrite) {
  if (typeof calendarId !== 'string' || calendarId === '') {
    throw bridgeError_('bad_request', 'calendarId가 필요합니다.');
  }
  var allowed = forWrite ? cfg.write : cfg.read;
  if (allowed.indexOf(calendarId) < 0) {
    throw bridgeError_('forbidden', forWrite ? '쓰기가 허용되지 않은 캘린더입니다.' : '읽기가 허용되지 않은 캘린더입니다.');
  }
  var calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw bridgeError_('not_found', '캘린더를 찾을 수 없습니다.');
  return calendar;
}

// ── 날짜 변환 ─────────────────────────────────────────

function parseIso_(value, name) {
  var time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (isNaN(time)) throw bridgeError_('bad_request', name + ' 값이 올바른 날짜가 아닙니다.');
  return new Date(time);
}

/** "YYYYMMDD" → 서울 기준 그날 00:00 */
function parseYmd_(value, name) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) {
    throw bridgeError_('bad_request', name + ' 값은 YYYYMMDD 형식이어야 합니다.');
  }
  var iso = value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8) + 'T00:00:00+09:00';
  var date = new Date(iso);
  if (isNaN(date.getTime()) || formatYmd_(date) !== value) {
    throw bridgeError_('bad_request', name + ' 값이 실제 날짜가 아닙니다.');
  }
  return date;
}

function formatYmd_(date) {
  return Utilities.formatDate(date, 'Asia/Seoul', 'yyyyMMdd');
}

function truncate_(value, max) {
  if (!value) return '';
  return value.length > max ? value.slice(0, max) : value;
}

function eventToJson_(event) {
  var allDay = event.isAllDayEvent();
  return {
    icalUid: event.getId(),
    title: event.getTitle(),
    allDay: allDay,
    start: allDay ? null : event.getStartTime().toISOString(),
    end: allDay ? null : event.getEndTime().toISOString(),
    startDate: allDay ? formatYmd_(event.getAllDayStartDate()) : null,
    // 종일 일정 종료일이 배타적(다음 날)인지는 PoC에서 확인한다
    endDate: allDay ? formatYmd_(event.getAllDayEndDate()) : null,
    instanceStart: event.getStartTime().toISOString(),
    location: event.getLocation() || '',
    description: truncate_(event.getDescription(), MAX_DESCRIPTION_LENGTH),
    recurring: event.isRecurringEvent(),
    lastUpdated: event.getLastUpdated().toISOString(),
  };
}

// ── action ────────────────────────────────────────────

function dispatch_(action, params) {
  var cfg = config_();
  switch (action) {
    case 'ping':
      return { now: new Date().toISOString(), testMode: cfg.testMode };
    case 'listCalendars':
      return listCalendars_(cfg);
    case 'listEvents':
      return listEvents_(cfg, params);
    case 'createEvent':
      return createEvent_(cfg, params);
    case 'updateEvent':
      return updateEvent_(cfg, params);
    case 'deleteEvent':
      return deleteEvent_(cfg, params);
    default:
      throw bridgeError_('unknown_action', '지원하지 않는 action입니다.');
  }
}

function listCalendars_(cfg) {
  return cfg.read
    .map(function (id) {
      var calendar = CalendarApp.getCalendarById(id);
      if (!calendar) return null;
      return {
        id: id,
        name: calendar.getName(),
        color: calendar.getColor(),
        writable: cfg.write.indexOf(id) >= 0,
      };
    })
    .filter(function (item) {
      return item !== null;
    });
}

function listEvents_(cfg, params) {
  var calendar = getCalendar_(cfg, params.calendarId, false);
  var from = parseIso_(params.from, 'from');
  var to = parseIso_(params.to, 'to');
  if (to.getTime() <= from.getTime()) throw bridgeError_('bad_request', 'to는 from보다 늦어야 합니다.');
  if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    throw bridgeError_('bad_request', '조회 기간은 ' + MAX_WINDOW_DAYS + '일 이하여야 합니다.');
  }
  var events = calendar.getEvents(from, to);
  return {
    events: events.slice(0, MAX_EVENTS).map(eventToJson_),
    truncated: events.length > MAX_EVENTS,
  };
}

function requireTitle_(cfg, title) {
  if (typeof title !== 'string' || title.trim() === '' || title.length > MAX_TITLE_LENGTH) {
    throw bridgeError_('bad_request', '제목은 1~' + MAX_TITLE_LENGTH + '자여야 합니다.');
  }
  if (cfg.testMode && title.indexOf(cfg.testPrefix) !== 0) {
    throw bridgeError_('test_mode', '테스트 모드에서는 제목이 ' + cfg.testPrefix + '로 시작해야 합니다.');
  }
  return title;
}

function eventOptions_(params) {
  // 게스트는 받지 않는다(초대 메일 방지)
  var options = {};
  if (typeof params.location === 'string') options.location = truncate_(params.location, 500);
  if (typeof params.description === 'string') options.description = truncate_(params.description, MAX_DESCRIPTION_LENGTH);
  return options;
}

function createEvent_(cfg, params) {
  var calendar = getCalendar_(cfg, params.calendarId, true);
  var title = requireTitle_(cfg, params.title);
  var options = eventOptions_(params);
  var event;
  if (params.allDay === true) {
    var startDate = parseYmd_(params.startDate, 'startDate');
    if (params.endDate) {
      // endDate는 배타적(마지막 날의 다음 날)으로 받는다
      var endDate = parseYmd_(params.endDate, 'endDate');
      if (endDate.getTime() <= startDate.getTime()) throw bridgeError_('bad_request', 'endDate는 startDate보다 늦어야 합니다.');
      event = calendar.createAllDayEvent(title, startDate, endDate, options);
    } else {
      event = calendar.createAllDayEvent(title, startDate, options);
    }
  } else {
    var start = parseIso_(params.start, 'start');
    var end = parseIso_(params.end, 'end');
    if (end.getTime() <= start.getTime()) throw bridgeError_('bad_request', 'end는 start보다 늦어야 합니다.');
    event = calendar.createEvent(title, start, end, options);
  }
  return eventToJson_(event);
}

/** iCalUID와 회차 시작 시각으로 일정 하나를 찾는다 */
function findEvent_(calendar, params) {
  if (typeof params.icalUid !== 'string' || params.icalUid === '') {
    throw bridgeError_('bad_request', 'icalUid가 필요합니다.');
  }
  var instanceStart = parseIso_(params.instanceStart, 'instanceStart');
  var from = new Date(instanceStart.getTime() - 1.5 * DAY_MS);
  var to = new Date(instanceStart.getTime() + 1.5 * DAY_MS);
  var matches = calendar.getEvents(from, to).filter(function (event) {
    return event.getId() === params.icalUid && event.getStartTime().getTime() === instanceStart.getTime();
  });
  if (matches.length === 0) throw bridgeError_('not_found', '일정을 찾을 수 없습니다.');
  if (matches.length > 1) throw bridgeError_('ambiguous', '같은 일정이 여러 개 있습니다.');
  return matches[0];
}

function guardMutation_(cfg, event, params) {
  if (event.isRecurringEvent()) {
    throw bridgeError_('recurring_readonly', '반복 일정은 대시보드에서 수정할 수 없습니다.');
  }
  if (cfg.testMode && event.getTitle().indexOf(cfg.testPrefix) !== 0) {
    throw bridgeError_('test_mode', '테스트 모드에서는 ' + cfg.testPrefix + ' 일정만 수정·삭제할 수 있습니다.');
  }
  var expected = parseIso_(params.expectedLastUpdated, 'expectedLastUpdated');
  if (event.getLastUpdated().getTime() !== expected.getTime()) {
    throw bridgeError_('conflict', '다른 곳에서 먼저 수정된 일정입니다. 새로고침 후 다시 시도해 주세요.');
  }
}

function updateEvent_(cfg, params) {
  var calendar = getCalendar_(cfg, params.calendarId, true);
  var event = findEvent_(calendar, params);
  guardMutation_(cfg, event, params);
  var patch = params.patch || {};

  if (patch.title !== undefined) event.setTitle(requireTitle_(cfg, patch.title));
  if (patch.location !== undefined) event.setLocation(truncate_(String(patch.location), 500));
  if (patch.description !== undefined) event.setDescription(truncate_(String(patch.description), MAX_DESCRIPTION_LENGTH));

  if (event.isAllDayEvent()) {
    if (patch.start !== undefined || patch.end !== undefined) {
      throw bridgeError_('bad_request', '종일 일정은 startDate/endDate로 수정합니다.');
    }
    if (patch.startDate !== undefined) {
      var startDate = parseYmd_(patch.startDate, 'startDate');
      if (patch.endDate) {
        var endDate = parseYmd_(patch.endDate, 'endDate');
        if (endDate.getTime() <= startDate.getTime()) throw bridgeError_('bad_request', 'endDate는 startDate보다 늦어야 합니다.');
        event.setAllDayDates(startDate, endDate);
      } else {
        event.setAllDayDate(startDate);
      }
    }
  } else {
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      throw bridgeError_('bad_request', '시간 지정 일정은 start/end로 수정합니다.');
    }
    if (patch.start !== undefined || patch.end !== undefined) {
      var start = patch.start !== undefined ? parseIso_(patch.start, 'start') : event.getStartTime();
      var end = patch.end !== undefined ? parseIso_(patch.end, 'end') : event.getEndTime();
      if (end.getTime() <= start.getTime()) throw bridgeError_('bad_request', 'end는 start보다 늦어야 합니다.');
      event.setTime(start, end);
    }
  }
  return eventToJson_(event);
}

function deleteEvent_(cfg, params) {
  var calendar = getCalendar_(cfg, params.calendarId, true);
  var event = findEvent_(calendar, params);
  guardMutation_(cfg, event, params);
  event.deleteEvent();
  return { deleted: true };
}

// ── 편집기에서 직접 실행하는 점검 함수 ─────────────────

/**
 * 편집기 상단에서 이 함수를 선택해 실행하면:
 * 1) 처음 한 번 Google 권한 승인 화면이 뜬다.
 * 2) 실행 로그에 내 캘린더 이름과 ID, 스크립트 속성 준비 상태가 표시된다.
 * 블루캐니언워터파크 캘린더 ID를 이 로그에서 찾아 WRITE_CALENDAR_IDS에 넣는다.
 */
function setupCheck() {
  var calendars = CalendarApp.getAllOwnedCalendars();
  console.log('내가 소유한 캘린더 ' + calendars.length + '개');
  calendars.forEach(function (calendar) {
    console.log('- ' + calendar.getName() + ' : ' + calendar.getId());
  });
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SHARED_SECRET');
  var cfg = config_();
  console.log('SHARED_SECRET: ' + (secret ? (secret.length >= 32 ? '설정됨' : '너무 짧음(32자 이상 필요)') : '없음'));
  console.log('읽기 허용 캘린더: ' + cfg.read.length + '개, 쓰기 허용 캘린더: ' + cfg.write.length + '개');
  console.log('TEST_MODE: ' + cfg.testMode + ', 제목 접두사: ' + cfg.testPrefix);
}
