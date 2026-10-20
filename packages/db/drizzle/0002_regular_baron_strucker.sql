CREATE TYPE "public"."moment" AS ENUM('back_to_work', 'family_event', 'date', 'photos', 'video_call', 'going_out', 'everyday');--> statement-breakpoint
CREATE TYPE "public"."tone" AS ENUM('practical', 'warm', 'light');--> statement-breakpoint
CREATE TYPE "public"."words_set" AS ENUM('gentle', 'christian', 'muslim', 'jewish');--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "tone" "tone" DEFAULT 'warm' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "words_set" "words_set";--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "body_photos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "snapshot" ADD COLUMN "moment" "moment";