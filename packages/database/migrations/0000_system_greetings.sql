CREATE TABLE "system_greetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"i18n_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_greetings_slug_unique" UNIQUE("slug"),
	CONSTRAINT "system_greetings_slug_format" CHECK ("system_greetings"."slug" ~ '^[a-z][a-z0-9-]*$'),
	CONSTRAINT "system_greetings_i18n_key_format" CHECK ("system_greetings"."i18n_key" ~ '^[a-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$')
);
