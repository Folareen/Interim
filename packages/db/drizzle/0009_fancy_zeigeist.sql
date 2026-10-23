ALTER TABLE "render" ALTER COLUMN "strategy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "fit" text NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "image_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD COLUMN "image_sha256" text NOT NULL;--> statement-breakpoint
ALTER TABLE "render" ADD COLUMN "garment_sku" text;--> statement-breakpoint
ALTER TABLE "render" ADD CONSTRAINT "render_garment_sku_catalog_item_sku_fk" FOREIGN KEY ("garment_sku") REFERENCES "public"."catalog_item"("sku") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "garment_profile_sku" ON "garment" USING btree ("profile_id","catalog_sku");