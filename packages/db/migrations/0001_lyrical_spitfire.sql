DROP INDEX "para_containers_name_trgm_idx";--> statement-breakpoint
CREATE INDEX "para_containers_name_trgm_idx" ON "para_containers" USING gin ("name" gin_trgm_ops);