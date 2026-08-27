ALTER TABLE "spine_styles"
  ADD COLUMN IF NOT EXISTS "binding_type" text NOT NULL DEFAULT 'coil',
  ADD COLUMN IF NOT EXISTS "finish" text NOT NULL DEFAULT 'gold';
--> statement-breakpoint
ALTER TABLE "spine_styles"
  ADD CONSTRAINT "spine_styles_binding_type_check"
    CHECK ("binding_type" IN ('coil', 'twin-loop', 'disc', '3-ring'));
--> statement-breakpoint
ALTER TABLE "spine_styles"
  ADD CONSTRAINT "spine_styles_finish_check"
    CHECK ("finish" IN ('gold', 'rose-gold', 'silver', 'copper', 'bronze', 'white', 'matte-black'));