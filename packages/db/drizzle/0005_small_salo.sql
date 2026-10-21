ALTER TABLE "photo" RENAME COLUMN "s3_key" TO "object_key";--> statement-breakpoint
ALTER TABLE "render" RENAME COLUMN "s3_key" TO "object_key";