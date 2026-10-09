ALTER TABLE "item_attachments" ADD COLUMN "object_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "item_attachments" ADD COLUMN "mime_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "item_attachments" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "item_attachments" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_attachments" ADD COLUMN "derived_text" text;--> statement-breakpoint
ALTER TABLE "item_attachments" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_attachments" DROP COLUMN "raw_content_url";--> statement-breakpoint
ALTER TABLE "item_attachments" ADD CONSTRAINT "item_attachments_object_key_unique" UNIQUE("object_key");