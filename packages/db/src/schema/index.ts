/**
 * Schéma Drizzle — point unique de définition des tables PostgreSQL.
 *
 * Modèles : users, sessions, organizations, organization_members,
 * projects (Prompt 05) + brain_entries, project_files, file_versions,
 * studio_designs, lab_entries, project_audits (Prompts 07-16).
 * Conventions : UUID (gen_random_uuid), timestamps timestamptz,
 * clés étrangères explicites avec politique de suppression,
 * contraintes d'unicité et index d'accès. Toutes les ressources
 * métier sont rattachées à un projet → organisation (isolation).
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Rôles de membres d'une organisation. */
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member']);

/** Statut d'un projet. */
export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'active',
  'archived',
]);

/** Comptes utilisateurs. L'e-mail est stocké normalisé en minuscules. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** Hash Argon2id — JAMAIS de mot de passe en clair. */
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

/** Sessions opaques : le cookie porte un jeton aléatoire, la base son hash. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 du jeton opaque (le jeton brut n'est jamais stocké). */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

/** Organisations (espaces de travail). */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

/** Appartenance utilisateur ↔ organisation (n:m) avec rôle. */
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_members_org_user_unique').on(
      table.organizationId,
      table.userId,
    ),
    index('organization_members_user_idx').on(table.userId),
  ],
);

/** Projets, rattachés à une organisation. */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    status: projectStatusEnum('status').notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('projects_org_slug_unique').on(table.organizationId, table.slug),
    index('projects_organization_idx').on(table.organizationId),
    index('projects_status_idx').on(table.status),
  ],
);

/** Catégories de la mémoire projet (Brain). */
export const brainKindEnum = pgEnum('brain_kind', [
  'context',
  'objective',
  'constraint',
  'decision',
  'architecture',
  'preference',
  'knowledge',
  'info',
]);

/** Types d'éléments NEXUS Lab. */
export const labKindEnum = pgEnum('lab_kind', [
  'experiment',
  'hypothesis',
  'question',
  'result',
  'source',
  'note',
  'conclusion',
]);

/** Mémoire structurée d'un projet (NEXUS Brain). */
export const brainEntries = pgTable(
  'brain_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: brainKindEnum('kind').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('brain_entries_project_idx').on(table.projectId),
    index('brain_entries_project_kind_idx').on(table.projectId, table.kind),
  ],
);

/**
 * Filesystem virtuel d'un projet (NEXUS Forge). Chemins relatifs
 * normalisés, uniques par projet ; le contenu est versionné dans
 * `file_versions` — jamais d'accès au disque hôte.
 */
export const projectFiles = pgTable(
  'project_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    name: text('name').notNull(),
    isDirectory: boolean('is_directory').notNull().default(false),
    mime: text('mime').notNull().default('text/plain'),
    size: integer('size').notNull().default(0),
    content: text('content'),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('project_files_project_path_unique').on(table.projectId, table.path),
    index('project_files_project_idx').on(table.projectId),
  ],
);

/** Historique des versions d'un fichier. */
export const fileVersions = pgTable(
  'file_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => projectFiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('file_versions_file_version_unique').on(table.fileId, table.version)],
);

/** Document de conception NEXUS Studio (JSON versionnable). */
export const studioDesigns = pgTable(
  'studio_designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    data: jsonb('data').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('studio_designs_project_version_unique').on(table.projectId, table.version)],
);

/** Éléments NEXUS Lab liés à un projet. */
export const labEntries = pgTable(
  'lab_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: labKindEnum('kind').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    sourceUrl: text('source_url'),
    sourceLabel: text('source_label'),
    /** Toujours `false` par défaut : une donnée non vérifiée est explicite. */
    verified: boolean('verified').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lab_entries_project_idx').on(table.projectId),
    index('lab_entries_project_kind_idx').on(table.projectId, table.kind),
  ],
);

/** Rapports d'audit NEXUS Doctor (historisé). */
export const projectAudits = pgTable(
  'project_audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    summary: jsonb('summary').notNull(),
    results: jsonb('results').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('project_audits_project_idx').on(table.projectId)],
);

/* ---------------------- Déploiements (Prompt 19) ---------------------- */

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
]);

export const deploymentStageNameEnum = pgEnum('deployment_stage_name', [
  'build',
  'test',
  'security',
  'staging',
  'production',
]);

/** Déploiement d'un projet — pipeline BUILD → TEST → SECURITY → STAGING → PRODUCTION. */
export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environment: text('environment').notNull(), // staging | production
    status: deploymentStatusEnum('status').notNull().default('pending'),
    /** Confirmation explicite requise pour débloquer l'étape PRODUCTION. */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('deployments_project_idx').on(table.projectId)],
);

/** Étape de pipeline : statut, début, fin, logs, erreur. */
export const deploymentStages = pgTable(
  'deployment_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    name: deploymentStageNameEnum('name').notNull(),
    status: deploymentStatusEnum('status').notNull().default('pending'),
    logs: jsonb('logs').notNull().default([]),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('deployment_stages_unique').on(table.deploymentId, table.name)],
);

/* ------------------------ Analytics (Prompt 20) ----------------------- */

/** Environnements strictement séparés : DEMO et LIVE ne sont JAMAIS mélangés. */
export const analyticsEnvEnum = pgEnum('analytics_env', ['demo', 'live']);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    environment: analyticsEnvEnum('environment').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('analytics_events_org_env_idx').on(table.organizationId, table.environment),
    index('analytics_events_org_type_idx').on(table.organizationId, table.type),
    index('analytics_events_occurred_idx').on(table.occurredAt),
  ],
);

/* ------------------------- NEXUS Pay (Prompt 21) ---------------------- */

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
]);

export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', [
  'charge',
  'fee',
  'net',
  'payout',
]);

export const payoutStatusEnum = pgEnum('payout_status', [
  'pending',
  'processing',
  'paid',
  'failed',
]);

/** Compte marchand, un par organisation. */
export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('merchants_org_unique').on(table.organizationId)],
);

/** Registre des providers — `configured` reste false tant qu'aucune
 * intégration officielle n'est réellement branchée. */
export const paymentProviders = pgTable(
  'payment_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    configured: boolean('configured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('payment_providers_code_unique').on(table.code)],
);

/** Transaction — montants entiers (FCFA, aucune décimale), fee 350 bps
 * calculé côté serveur. JAMAIS de PAN/CVV : checkout hébergé tokenisé. */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    providerCode: text('provider_code').notNull(),
    amount: integer('amount').notNull(),
    feeAmount: integer('fee_amount').notNull(),
    netAmount: integer('net_amount').notNull(),
    currency: text('currency').notNull().default('XOF'),
    status: transactionStatusEnum('status').notNull().default('pending'),
    /** Clé d'idempotence fournie par l'appelant. */
    idempotencyKey: text('idempotency_key').notNull(),
    /** Jeton de checkout hébergé — aucune donnée de carte. */
    checkoutToken: text('checkout_token').notNull(),
    providerReference: text('provider_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('transactions_idempotency_unique').on(table.organizationId, table.idempotencyKey),
    index('transactions_merchant_idx').on(table.merchantId),
    index('transactions_status_idx').on(table.status),
  ],
);

/** Grand livre en partie double : SUM(debit) = SUM(credit) toujours. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
    payoutId: uuid('payout_id'),
    entryType: ledgerEntryTypeEnum('entry_type').notNull(),
    account: text('account').notNull(),
    debit: integer('debit').notNull().default(0),
    credit: integer('credit').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ledger_transaction_idx').on(table.transactionId),
    index('ledger_account_idx').on(table.account),
  ],
);

/** Versements vers un compte marchand (destination tokenisée). */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('XOF'),
    status: payoutStatusEnum('status').notNull().default('pending'),
    /** Référence de destination tokenisée — jamais de donnée bancaire brute. */
    destinationToken: text('destination_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [index('payouts_merchant_idx').on(table.merchantId)],
);

export const ideaStatusEnum = pgEnum('idea_status', ['nouveau', 'evalue', 'valide']);

/**
 * NEXUS Ideas — capture d'idées par organisation (réel, persistant).
 * Les votes sont incrémentés atomiquement côté serveur.
 */
export const ideas = pgTable(
  'ideas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    detail: text('detail').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    votes: integer('votes').notNull().default(0),
    status: ideaStatusEnum('status').notNull().default('nouveau'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ideas_org_idx').on(table.organizationId)],
);
