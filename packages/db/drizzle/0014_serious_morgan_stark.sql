CREATE TYPE "public"."profile_kind" AS ENUM('situation', 'style');--> statement-breakpoint
CREATE TYPE "public"."style_photo_role" AS ENUM('reference', 'current');--> statement-breakpoint
CREATE TABLE "style_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "style_photo_role" NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_preview" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"reference_photo_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"object_key" text,
	"expires_at" timestamp NOT NULL,
	"saved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"current_photo_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_request_reference" (
	"request_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "style_request_reference_request_id_photo_id_pk" PRIMARY KEY("request_id","photo_id")
);
--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "template_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "snapshot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "template_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "template_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "kind" "profile_kind" DEFAULT 'situation' NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "style_request_id" uuid;--> statement-breakpoint
ALTER TABLE "style_photo" ADD CONSTRAINT "style_photo_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_preview" ADD CONSTRAINT "style_preview_request_id_style_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."style_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_preview" ADD CONSTRAINT "style_preview_reference_photo_id_style_photo_id_fk" FOREIGN KEY ("reference_photo_id") REFERENCES "public"."style_photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_request" ADD CONSTRAINT "style_request_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_request" ADD CONSTRAINT "style_request_current_photo_id_style_photo_id_fk" FOREIGN KEY ("current_photo_id") REFERENCES "public"."style_photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_request_reference" ADD CONSTRAINT "style_request_reference_request_id_style_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."style_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_request_reference" ADD CONSTRAINT "style_request_reference_photo_id_style_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."style_photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "style_photo_profile_role_sha" ON "style_photo" USING btree ("profile_id","role","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "style_preview_request_reference" ON "style_preview" USING btree ("request_id","reference_photo_id");--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_style_request_id_style_request_id_fk" FOREIGN KEY ("style_request_id") REFERENCES "public"."style_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_style_request" ON "run" USING btree ("style_request_id");--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_template_matches_kind" CHECK (("profile"."kind" = 'style') = ("profile"."template_key" is null));--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_one_subject" CHECK (("run"."snapshot_id" is null) <> ("run"."style_request_id" is null));