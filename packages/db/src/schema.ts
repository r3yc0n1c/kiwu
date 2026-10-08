/* Notes:

TODO: UUID v7 for ids as PK
- https://github.com/drizzle-team/drizzle-orm/pull/5722/changes
*/

import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  index,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// --- Users ---
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  magicLinkToken: text("magic_link_token"),
  magicLinkExpiresAt: timestamp("magic_link_expires_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- PARA Containers ---
export const paraContainers = pgTable(
  "para_containers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<"project" | "area" | "resource">(),
    name: text("name").notNull(),
    // Archive is a state timestamp, not a distinct container type per PARA rules
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Drizzle index for pg_trgm fuzzy matching used in auto-filing
    index("para_containers_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
  ],
);

// --- Items (Notes, Connectors, Media) ---
export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  paraContainerId: uuid("para_container_id").references(() => paraContainers.id, {
    onDelete: "set null",
  }),

  source: text("source").notNull(), // 'web' | 'ios' | 'android' | 'email' | 'connector'
  rawType: text("raw_type").notNull(), // 'text' | 'image' | 'audio' | 'mixed' | 'connector_event'
  // Deprecated mirror of item_attachments[0].object_key; no longer written — drop in cleanup ticket
  rawContentUrl: text("raw_content_url"),
  // user-typed text (caption / text note); transcript_or_ocr is derived text only
  userNote: text("user_note"),
  transcriptOrOcr: text("transcript_or_ocr"),

  title: text("title"),
  summary: text("summary"),

  eventTime: timestamp("event_time", { withTimezone: true }),
  eventTimeEnd: timestamp("event_time_end", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),

  confidence: real("confidence"),

  // Absolute positioning for the drag-and-drop dashboard
  boardX: real("board_x").default(0).notNull(),
  boardY: real("board_y").default(0).notNull(),

  status: text("status").default("pending").$type<"pending" | "active" | "failed" | "archived">(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Item Attachments (one capture can hold many files) ---
export const itemAttachments = pgTable("item_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  // storage key (not URL); presigned GET at read time
  objectKey: text("object_key").notNull().unique(),
  rawType: text("raw_type").notNull(), // derived from mime_type server-side: 'image' | 'audio'
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes"),
  // user's image order within one capture
  position: integer("position").notNull().default(0),
  // per-file OCR/description/transcript (worker, KIWU-17)
  derivedText: text("derived_text"),
  status: text("status").default("pending").$type<"pending" | "done" | "failed">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Idempotency Keys ---
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    itemId: uuid("item_id"),
    statusCode: integer("status_code"),
    completed: boolean("completed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // TODO: 24h TTL cleanup is a daily job to-do, keys are small; add when table grows
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// --- Connector Accounts (Google Calendar, Gmail) ---
export const connectorAccounts = pgTable("connector_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'google_calendar' | 'gmail'
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Chat Sessions ---
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Chat Messages ---
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"user" | "assistant" | "system">(),
  content: text("content").notNull(),
  // Drizzle doesn't have a native UUID array type out of the box without custom mapping,
  // but using text array works perfectly for storing retrieved item IDs
  retrievedItemIds: text("retrieved_item_ids")
    .array()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Generate Zod schema
export const selectUserSchema = createSelectSchema(users);
export const insertItemSchema = createInsertSchema(items, {
  confidence: z.number().min(0).max(1).optional(),
  boardX: z.number().default(0),
  boardY: z.number().default(0),
});

export type InsertItem = z.infer<typeof insertItemSchema>;
