CREATE TYPE "public"."agent_step" AS ENUM('observe', 'measure', 'place', 'decide', 'act', 'compose', 'stop');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."strategy" AS ENUM('cut', 'volume', 'colour', 'cover', 'hold');--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."run_status";--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "status" SET DATA TYPE "public"."run_status" USING "status"::"public"."run_status";--> statement-breakpoint
ALTER TABLE "trace_entry" ALTER COLUMN "tool" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "call_cache" ADD COLUMN "profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "call_cache" ADD COLUMN "tool" text NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement" ADD COLUMN "reliable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "render" ADD COLUMN "strategy" "strategy" NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "retake" text;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "stage_card" ADD COLUMN "profile_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "trace_entry" ADD COLUMN "step" "agent_step" NOT NULL;--> statement-breakpoint
ALTER TABLE "youcam_task" ADD COLUMN "cache_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "call_cache" ADD CONSTRAINT "call_cache_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_card" ADD CONSTRAINT "stage_card_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_snapshot_tool" ON "measurement" USING btree ("snapshot_id","tool");--> statement-breakpoint
CREATE UNIQUE INDEX "render_snapshot_input" ON "render" USING btree ("snapshot_id","input_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "run_snapshot" ON "run" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_card_run" ON "stage_card" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trace_entry_run_seq" ON "trace_entry" USING btree ("run_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "youcam_task_run_key" ON "youcam_task" USING btree ("run_id","cache_key");