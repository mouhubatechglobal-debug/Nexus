CREATE TYPE "public"."brain_kind" AS ENUM('context', 'objective', 'constraint', 'decision', 'architecture', 'preference', 'knowledge', 'info');--> statement-breakpoint
CREATE TYPE "public"."lab_kind" AS ENUM('experiment', 'hypothesis', 'question', 'result', 'source', 'note', 'conclusion');--> statement-breakpoint
CREATE TABLE "brain_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "brain_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "lab_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"source_label" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"summary" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"is_directory" boolean DEFAULT false NOT NULL,
	"mime" text DEFAULT 'text/plain' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"content" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brain_entries" ADD CONSTRAINT "brain_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_entries" ADD CONSTRAINT "brain_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_entries" ADD CONSTRAINT "lab_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_entries" ADD CONSTRAINT "lab_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_audits" ADD CONSTRAINT "project_audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_audits" ADD CONSTRAINT "project_audits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_designs" ADD CONSTRAINT "studio_designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_designs" ADD CONSTRAINT "studio_designs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_entries_project_idx" ON "brain_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "brain_entries_project_kind_idx" ON "brain_entries" USING btree ("project_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "file_versions_file_version_unique" ON "file_versions" USING btree ("file_id","version");--> statement-breakpoint
CREATE INDEX "lab_entries_project_idx" ON "lab_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "lab_entries_project_kind_idx" ON "lab_entries" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "project_audits_project_idx" ON "project_audits" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_files_project_path_unique" ON "project_files" USING btree ("project_id","path");--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_designs_project_version_unique" ON "studio_designs" USING btree ("project_id","version");