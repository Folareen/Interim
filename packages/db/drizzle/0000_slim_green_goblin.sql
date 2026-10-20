CREATE TYPE "public"."cache_outcome" AS ENUM('success', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."change_report" AS ENUM('none', 'some', 'lot');--> statement-breakpoint
CREATE TYPE "public"."consent_action" AS ENUM('grant', 'withdraw');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('reserve', 'settle', 'release');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('front', 'left', 'right', 'top', 'body');--> statement-breakpoint
CREATE TYPE "public"."retention" AS ENUM('standard', 'extended');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('intent', 'created', 'polling', 'done', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "budget_counter" (
	"scope" text PRIMARY KEY NOT NULL,
	"reserved_units" integer DEFAULT 0 NOT NULL,
	"settled_units" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"outcome" "cache_outcome" NOT NULL,
	"result_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"sku" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"size_chart_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" text NOT NULL,
	"action" "consent_action" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "garment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"catalog_sku" text NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_ref" uuid NOT NULL,
	"run_id" uuid,
	"tool" text NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"units" integer NOT NULL,
	"task_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"value_json" jsonb NOT NULL,
	"youcam_task_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"kind" "photo_kind" NOT NULL,
	"s3_key" text NOT NULL,
	"sha256" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"owner_ref" text NOT NULL,
	"consent_version" text NOT NULL,
	"consented_at" timestamp,
	"retention" "retention" DEFAULT 'standard' NOT NULL,
	"judge_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"input_hash" text NOT NULL,
	"s3_key" text,
	"label" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"status" text NOT NULL,
	"stop_reason" text,
	"budget_units" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"changed" "change_report" NOT NULL,
	"reported_size" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"taken_at" timestamp DEFAULT now() NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"stage_key" text,
	"capture_check_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"card_json" jsonb NOT NULL,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"tool" text NOT NULL,
	"inputs_json" jsonb NOT NULL,
	"outputs_ref" text,
	"cost_units" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youcam_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"run_id" uuid,
	"tool" text NOT NULL,
	"state" "task_state" DEFAULT 'intent' NOT NULL,
	"youcam_task_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garment" ADD CONSTRAINT "garment_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garment" ADD CONSTRAINT "garment_catalog_sku_catalog_item_sku_fk" FOREIGN KEY ("catalog_sku") REFERENCES "public"."catalog_item"("sku") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement" ADD CONSTRAINT "measurement_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render" ADD CONSTRAINT "render_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_report" ADD CONSTRAINT "self_report_snapshot_id_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_card_id_stage_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."stage_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot" ADD CONSTRAINT "snapshot_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_card" ADD CONSTRAINT "stage_card_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_entry" ADD CONSTRAINT "trace_entry_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youcam_task" ADD CONSTRAINT "youcam_task_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youcam_task" ADD CONSTRAINT "youcam_task_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE set null ON UPDATE no action;