CREATE TYPE "public"."reflection_safety" AS ENUM('none', 'match', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."review_reason" AS ENUM('match', 'near');--> statement-breakpoint
CREATE TYPE "public"."review_verdict" AS ENUM('pending', 'concern', 'clear', 'unsure');--> statement-breakpoint
CREATE TABLE "reflection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"text" text NOT NULL,
	"locale" "locale" NOT NULL,
	"safety" "reflection_safety" DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reflection_id" uuid NOT NULL,
	"reason" "review_reason" NOT NULL,
	"verdict" "review_verdict" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "safety_review_reflection_id_unique" UNIQUE("reflection_id")
);
--> statement-breakpoint
ALTER TABLE "reflection" ADD CONSTRAINT "reflection_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_review" ADD CONSTRAINT "safety_review_reflection_id_reflection_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."reflection"("id") ON DELETE cascade ON UPDATE no action;