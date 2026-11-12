CREATE TABLE "exercise_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"muscle_groups" text[] NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_library_key_unique" UNIQUE("key"),
	CONSTRAINT "exercise_library_key_format" CHECK ("exercise_library"."key" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
	CONSTRAINT "exercise_library_type_known" CHECK ("exercise_library"."type" in ('weight-reps', 'reps-only', 'time', 'distance-time')),
	CONSTRAINT "exercise_library_muscle_groups_known" CHECK (cardinality("exercise_library"."muscle_groups") >= 1 and "exercise_library"."muscle_groups" <@ array['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'core', 'cardio', 'full-body']::text[])
);
