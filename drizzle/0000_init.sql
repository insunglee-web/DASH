CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_user_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_github_user_id_unique" UNIQUE("github_user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"result" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "app"."connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account" text,
	"scopes" text[],
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."gcal_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"google_calendar_id" text NOT NULL,
	"summary" text NOT NULL,
	"is_writable" boolean DEFAULT false NOT NULL,
	"color" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"last_window_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."gcal_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"ical_uid" text NOT NULL,
	"instance_start" timestamp with time zone NOT NULL,
	"last_updated_remote" timestamp with time zone,
	"summary" text DEFAULT '' NOT NULL,
	"location" text,
	"description" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_date" char(8),
	"end_date" char(8),
	"is_all_day" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"missing_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."mail_classification" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb NOT NULL,
	"rule_version" integer NOT NULL,
	"overridden_level" text,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."mail_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"from_level" text NOT NULL,
	"to_level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."mail_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" text NOT NULL,
	"name" text NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"last_seen_mail_id" bigint,
	"last_received_time" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."mail_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"mail_id" bigint NOT NULL,
	"from_name" text,
	"from_email" text,
	"to_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text NOT NULL,
	"is_important_flag" boolean DEFAULT false NOT NULL,
	"security_level" text,
	"attach_count" integer DEFAULT 0 NOT NULL,
	"size_bytes" bigint,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."mail_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"pattern" text NOT NULL,
	"weight" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."notion_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"root_id" uuid NOT NULL,
	"notion_page_id" text NOT NULL,
	"parent_notion_page_id" text,
	"title" text NOT NULL,
	"meeting_date" char(8),
	"title_suffix" text,
	"weekday_mismatch" boolean DEFAULT false NOT NULL,
	"date_source" text NOT NULL,
	"url" text,
	"created_time" timestamp with time zone,
	"last_edited_time" timestamp with time zone,
	"content_synced_edited_time" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_page_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "app"."notion_page_content" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"blocks" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"block_count" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."notion_root" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notion_page_id" text NOT NULL,
	"title" text,
	"max_depth" integer DEFAULT 2 NOT NULL,
	CONSTRAINT "notion_root_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "app"."oauth_token" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"access_token_enc" "bytea" NOT NULL,
	"refresh_token_enc" "bytea",
	"enc_key_version" integer NOT NULL,
	"access_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"items_changed" integer DEFAULT 0 NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "app"."sync_state" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"lease_until" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_tick_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"cursor" jsonb,
	CONSTRAINT "sync_state_user_id_source_pk" PRIMARY KEY("user_id","source")
);
--> statement-breakpoint
CREATE TABLE "app"."user_setting" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_setting_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."connection" ADD CONSTRAINT "connection_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gcal_calendar" ADD CONSTRAINT "gcal_calendar_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gcal_event" ADD CONSTRAINT "gcal_event_calendar_id_gcal_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "app"."gcal_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mail_classification" ADD CONSTRAINT "mail_classification_message_id_mail_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."mail_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mail_feedback" ADD CONSTRAINT "mail_feedback_message_id_mail_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."mail_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mail_folder" ADD CONSTRAINT "mail_folder_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mail_message" ADD CONSTRAINT "mail_message_folder_id_mail_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "app"."mail_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mail_rule" ADD CONSTRAINT "mail_rule_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notion_page" ADD CONSTRAINT "notion_page_root_id_notion_root_id_fk" FOREIGN KEY ("root_id") REFERENCES "app"."notion_root"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notion_page_content" ADD CONSTRAINT "notion_page_content_page_id_notion_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "app"."notion_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notion_root" ADD CONSTRAINT "notion_root_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."oauth_token" ADD CONSTRAINT "oauth_token_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sync_run" ADD CONSTRAINT "sync_run_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sync_state" ADD CONSTRAINT "sync_state_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_setting" ADD CONSTRAINT "user_setting_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "app"."audit_log" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "connection_user_provider_uq" ON "app"."connection" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "gcal_calendar_user_cal_uq" ON "app"."gcal_calendar" USING btree ("user_id","google_calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gcal_event_instance_uq" ON "app"."gcal_event" USING btree ("calendar_id","ical_uid","instance_start");--> statement-breakpoint
CREATE INDEX "gcal_event_start_at_idx" ON "app"."gcal_event" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "gcal_event_start_date_idx" ON "app"."gcal_event" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_folder_user_folder_uq" ON "app"."mail_folder" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_message_folder_mail_uq" ON "app"."mail_message" USING btree ("folder_id","mail_id");--> statement-breakpoint
CREATE INDEX "mail_message_received_at_idx" ON "app"."mail_message" USING btree ("received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notion_page_meeting_date_idx" ON "app"."notion_page" USING btree ("meeting_date");--> statement-breakpoint
CREATE INDEX "sync_run_started_at_idx" ON "app"."sync_run" USING btree ("started_at" DESC NULLS LAST);