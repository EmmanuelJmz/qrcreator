import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { OwnerEmergencyProfile } from '../../lib/emergency-profile.ts';
import type {
  OwnerCardThemeOverride,
  PublicCardTheme,
} from '../../lib/public-card-theme.ts';

export const owners = pgTable(
  'owners',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 150 }),
    phone: varchar('phone', { length: 30 }),
    status: boolean('status').default(true).notNull(),
    publicTokenHash: char('public_token_hash', { length: 64 }).unique(),
    encryptedPublicToken: text('encrypted_public_token'),
    tokenVersion: integer('token_version').default(1).notNull(),
    scanCount: integer('scan_count').default(0).notNull(),
    lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
    cardThemeOverride: jsonb('card_theme_override').$type<OwnerCardThemeOverride | null>(),
    emergencyProfile: jsonb('emergency_profile').$type<OwnerEmergencyProfile | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('owners_name_idx').on(table.lastName, table.firstName),
    index('owners_email_idx').on(table.email),
    index('owners_phone_idx').on(table.phone),
  ],
);

export const ownerDocuments = pgTable(
  'owner_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull().unique(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('owner_documents_owner_idx').on(table.ownerId)],
);

export const templates = pgTable('templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull().unique(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .unique()
      .references(() => owners.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'restrict' }),
    positionX: numeric('position_x', { precision: 6, scale: 2 }).notNull(),
    positionY: numeric('position_y', { precision: 6, scale: 2 }).notNull(),
    width: numeric('width', { precision: 6, scale: 2 }).notNull(),
    height: numeric('height', { precision: 6, scale: 2 }).notNull(),
    qrStyle: varchar('qr_style', { length: 40 }).default('fluid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('labels_template_idx').on(table.templateId)],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    ipHash: char('ip_hash', { length: 64 }).notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('login_attempts_ip_time_idx').on(table.ipHash, table.attemptedAt),
    index('login_attempts_time_idx').on(table.attemptedAt),
  ],
);

export const publicCardSettings = pgTable('public_card_settings', {
  id: integer('id').primaryKey().default(1),
  theme: jsonb('theme').$type<PublicCardTheme>().notNull(),
  logoStorageKey: varchar('logo_storage_key', { length: 500 }),
  logoMimeType: varchar('logo_mime_type', { length: 100 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ownersRelations = relations(owners, ({ many, one }) => ({
  documents: many(ownerDocuments),
  label: one(labels, {
    fields: [owners.id],
    references: [labels.ownerId],
  }),
}));

export const ownerDocumentsRelations = relations(ownerDocuments, ({ one }) => ({
  owner: one(owners, {
    fields: [ownerDocuments.ownerId],
    references: [owners.id],
  }),
}));

export const templatesRelations = relations(templates, ({ many }) => ({
  labels: many(labels),
}));

export const labelsRelations = relations(labels, ({ one }) => ({
  owner: one(owners, {
    fields: [labels.ownerId],
    references: [owners.id],
  }),
  template: one(templates, {
    fields: [labels.templateId],
    references: [templates.id],
  }),
}));
