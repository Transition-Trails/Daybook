/**
 * Adds physical border-width columns without rewriting historical pixel values.
 *
 * Existing `border_width` remains a legacy 96-DPI pixel measurement. The image
 * pipeline converts it on read when `border_width_mm` is null, so old stickers
 * and presets preserve their intended visual weight when reprocessed.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-sticker-border-width-mm
 */
import { pool } from "@workspace/db";

await pool.query(`
  ALTER TABLE stickers_library
  ADD COLUMN IF NOT EXISTS border_width_mm REAL;

  ALTER TABLE style_presets
  ADD COLUMN IF NOT EXISTS border_width_mm REAL;
`);

console.log("Added nullable border_width_mm columns; legacy border_width remains unchanged.");
await pool.end();