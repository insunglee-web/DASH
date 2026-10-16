import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  customType,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// docs/database-schema.md 기준. 앱 테이블은 Supabase Data API에 노출하지 않는 `app` 스키마에 둔다.
export const app = pgSchema("app");

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const ymd = (name: string) => char(name, { length: 8 });

export const appUser = app.table("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
  githubLogin: text("github_login").notNull(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  createdAt: createdAt(),
});

export const connection = app.table(
  "connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["naverworks", "notion", "gas_calendar"] }).notNull(),
    externalAccount: text("external_account"),
    scopes: text("scopes").array(),
    status: text("status", { enum: ["active", "reauth_required", "revoked", "error"] })
      .notNull()
      .default("active"),
    lastError: text("last_error"),
    connectedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connection_user_provider_uq").on(t.userId, t.provider)],
);

export const oauthToken = app.table("oauth_token", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => connection.id, { onDelete: "cascade" }),
  accessTokenEnc: bytea("access_token_enc").notNull(),
  refreshTokenEnc: bytea("refresh_token_enc"),
  encKeyVersion: integer("enc_key_version").notNull(),
  accessExpiresAt: ts("access_expires_at"),
  refreshExpiresAt: ts("refresh_expires_at"),
  version: integer("version").notNull().default(1),
  updatedAt: updatedAt(),
});

export const userSetting = app.table(
  "user_setting",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ── Notion ──────────────────────────────────────────────

export const notionRoot = app.table("notion_root", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  notionPageId: text("notion_page_id").notNull().unique(),
  title: text("title"),
  maxDepth: integer("max_depth").notNull().default(2),
});

export const notionPage = app.table(
  "notion_page",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rootId: uuid("root_id")
      .notNull()
      .references(() => notionRoot.id, { onDelete: "cascade" }),
    notionPageId: text("notion_page_id").notNull().unique(),
    parentNotionPageId: text("parent_notion_page_id"),
    title: text("title").notNull(),
    meetingDate: ymd("meeting_date"),
    titleSuffix: text("title_suffix"),
    weekdayMismatch: boolean("weekday_mismatch").notNull().default(false),
    dateSource: text("date_source", { enum: ["title", "created_time", "manual", "unparsed"] }).notNull(),
    url: text("url"),
    createdTime: ts("created_time"),
    lastEditedTime: ts("last_edited_time"),
    contentSyncedEditedTime: ts("content_synced_edited_time"),
    archived: boolean("archived").notNull().default(false),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [index("notion_page_meeting_date_idx").on(t.meetingDate)],
);

export const notionPageContent = app.table("notion_page_content", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => notionPage.id, { onDelete: "cascade" }),
  blocks: jsonb("blocks").notNull(),
  plainText: text("plain_text").notNull().default(""),
  blockCount: integer("block_count").notNull().default(0),
  truncated: boolean("truncated").notNull().default(false),
});

// ── Google Calendar (Apps Script 브리지, D-11) ─────────

export const gcalCalendar = app.table(
  "gcal_calendar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    googleCalendarId: text("google_calendar_id").notNull(),
    summary: text("summary").notNull(),
    isWritable: boolean("is_writable").notNull().default(false),
    color: text("color"),
    isVisible: boolean("is_visible").notNull().default(true),
    lastWindowSyncedAt: ts("last_window_synced_at"),
  },
  (t) => [uniqueIndex("gcal_calendar_user_cal_uq").on(t.userId, t.googleCalendarId)],
);

export const gcalEvent = app.table(
  "gcal_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => gcalCalendar.id, { onDelete: "cascade" }),
    icalUid: text("ical_uid").notNull(),
    instanceStart: ts("instance_start").notNull(),
    lastUpdatedRemote: ts("last_updated_remote"),
    summary: text("summary").notNull().default(""),
    location: text("location"),
    description: text("description"),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    startDate: ymd("start_date"),
    endDate: ymd("end_date"),
    isAllDay: boolean("is_all_day").notNull().default(false),
    isRecurring: boolean("is_recurring").notNull().default(false),
    missingSince: ts("missing_since"),
  },
  (t) => [
    uniqueIndex("gcal_event_instance_uq").on(t.calendarId, t.icalUid, t.instanceStart),
    index("gcal_event_start_at_idx").on(t.startAt),
    index("gcal_event_start_date_idx").on(t.startDate),
  ],
);

// ── NAVER WORKS 메일 (메타데이터만, D-03) ─────────────

export const mailFolder = app.table(
  "mail_folder",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull(),
    name: text("name").notNull(),
    isSynced: boolean("is_synced").notNull().default(false),
    lastSeenMailId: bigint("last_seen_mail_id", { mode: "number" }),
    lastReceivedTime: ts("last_received_time"),
    unreadCount: integer("unread_count").notNull().default(0),
  },
  (t) => [uniqueIndex("mail_folder_user_folder_uq").on(t.userId, t.folderId)],
);

export const mailMessage = app.table(
  "mail_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => mailFolder.id, { onDelete: "cascade" }),
    mailId: bigint("mail_id", { mode: "number" }).notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    toEmails: text("to_emails").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull(),
    receivedAt: ts("received_at").notNull(),
    sentAt: ts("sent_at"),
    status: text("status", { enum: ["Read", "Unread"] }).notNull(),
    isImportantFlag: boolean("is_important_flag").notNull().default(false),
    securityLevel: text("security_level"),
    attachCount: integer("attach_count").notNull().default(0),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mail_message_folder_mail_uq").on(t.folderId, t.mailId),
    index("mail_message_received_at_idx").on(t.receivedAt.desc()),
  ],
);

export const mailLevel = ["urgent", "important", "normal", "low"] as const;

export const mailClassification = app.table("mail_classification", {
  messageId: uuid("message_id")
    .primaryKey()
    .references(() => mailMessage.id, { onDelete: "cascade" }),
  level: text("level", { enum: mailLevel }).notNull(),
  score: integer("score").notNull(),
  reasons: jsonb("reasons").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  overriddenLevel: text("overridden_level", { enum: mailLevel }),
  classifiedAt: ts("classified_at").notNull().defaultNow(),
});

export const mailRule = app.table("mail_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["sender", "domain", "subject_keyword", "security_level", "flag"],
  }).notNull(),
  pattern: text("pattern").notNull(),
  weight: integer("weight").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const mailFeedback = app.table("mail_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => mailMessage.id, { onDelete: "cascade" }),
  fromLevel: text("from_level", { enum: mailLevel }).notNull(),
  toLevel: text("to_level", { enum: mailLevel }).notNull(),
  createdAt: createdAt(),
});

// ── 동기화와 감사 로그 ──────────────────────────────────

export const syncSource = ["mail", "calendar", "notion", "maintenance"] as const;

export const syncState = app.table(
  "sync_state",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    source: text("source", { enum: syncSource }).notNull(),
    leaseUntil: ts("lease_until"),
    nextRunAt: ts("next_run_at"),
    lastTickAt: ts("last_tick_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastSuccessAt: ts("last_success_at"),
    cursor: jsonb("cursor"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source] })],
);

export const syncRun = app.table(
  "sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    source: text("source", { enum: syncSource }).notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    status: text("status", { enum: ["running", "success", "partial", "failed", "skipped", "deferred"] })
      .notNull()
      .default("running"),
    itemsFetched: integer("items_fetched").notNull().default(0),
    itemsChanged: integer("items_changed").notNull().default(0),
    apiCalls: integer("api_calls").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (t) => [index("sync_run_started_at_idx").on(t.startedAt.desc())],
);

export const auditLog = app.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => appUser.id, { onDelete: "set null" }),
    at: ts("at").notNull().defaultNow(),
    action: text("action").notNull(),
    target: text("target"),
    result: text("result", { enum: ["success", "failure"] }).notNull(),
    detail: jsonb("detail"),
  },
  (t) => [index("audit_log_at_idx").on(t.at.desc())],
);
