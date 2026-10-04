CREATE TYPE "public"."channel_kind" AS ENUM('telegram', 'whatsapp', 'mock');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('pending', 'granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."deletion_scope" AS ENUM('all', 'channel');--> statement-breakpoint
CREATE TYPE "public"."deletion_status" AS ENUM('pending', 'processing', 'done');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'photo', 'pdf', 'voice', 'forwarded', 'command', 'other');--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor" uuid,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "channel_kind" NOT NULL,
	"external_id" text NOT NULL,
	"external_tag" text,
	"consent" "consent_status" DEFAULT 'granted' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_external_unique" UNIQUE("channel","external_id")
);
--> statement-breakpoint
CREATE TABLE "channel_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "channel_kind" NOT NULL,
	"code" varchar(12) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_link_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"kind" "message_kind" NOT NULL,
	"external_message_id" text NOT NULL,
	"forwarded" boolean DEFAULT false NOT NULL,
	"media_bytes" integer,
	"reply_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_message_idempotent" UNIQUE("direction","external_message_id")
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "deletion_scope" NOT NULL,
	"status" "deletion_status" DEFAULT 'pending' NOT NULL,
	"proof" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_actor_users_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link_codes" ADD CONSTRAINT "channel_link_codes_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link_codes" ADD CONSTRAINT "channel_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_identity_id_channel_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."channel_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_logs_tenant_idx" ON "access_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "channel_tenant_idx" ON "channel_identities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "link_codes_tenant_idx" ON "channel_link_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "channel_messages_identity_idx" ON "channel_messages" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "deletion_tenant_idx" ON "deletion_requests" USING btree ("tenant_id");