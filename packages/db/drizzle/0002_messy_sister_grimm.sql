CREATE TYPE "public"."analytics_env" AS ENUM('demo', 'live');--> statement-breakpoint
CREATE TYPE "public"."deployment_stage_name" AS ENUM('build', 'test', 'security', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'running', 'success', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('charge', 'fee', 'net', 'payout');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"type" text NOT NULL,
	"environment" "analytics_env" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"name" "deployment_stage_name" NOT NULL,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"payout_id" uuid,
	"entry_type" "ledger_entry_type" NOT NULL,
	"account" text NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"configured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"destination_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_code" text NOT NULL,
	"amount" integer NOT NULL,
	"fee_amount" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"checkout_token" text NOT NULL,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_stages" ADD CONSTRAINT "deployment_stages_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_org_env_idx" ON "analytics_events" USING btree ("organization_id","environment");--> statement-breakpoint
CREATE INDEX "analytics_events_org_type_idx" ON "analytics_events" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_stages_unique" ON "deployment_stages" USING btree ("deployment_id","name");--> statement-breakpoint
CREATE INDEX "deployments_project_idx" ON "deployments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ledger_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_org_unique" ON "merchants" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_providers_code_unique" ON "payment_providers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "payouts_merchant_idx" ON "payouts" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idempotency_unique" ON "transactions" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "transactions_merchant_idx" ON "transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");