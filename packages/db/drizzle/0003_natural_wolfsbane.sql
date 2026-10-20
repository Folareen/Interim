CREATE TYPE "public"."locale" AS ENUM('en', 'fr', 'es', 'it', 'pt', 'sw', 'ha', 'yo', 'ig', 'pcm');--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "locale" "locale" DEFAULT 'en' NOT NULL;