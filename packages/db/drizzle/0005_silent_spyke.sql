CREATE TABLE "channel_seen_messages" (
	"external_message_id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
