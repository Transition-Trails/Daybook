/*
 * Help categories now use the support-area keys shared by owner and buyer
 * support. Values outside the known legacy labels intentionally land in
 * something-else so every existing row is valid and no article is discarded.
 */
UPDATE "help_content"
SET "category" = CASE
  WHEN lower(trim("category")) IN ('building-planner', 'building a planner') THEN 'building-planner'
  WHEN lower(trim("category")) IN ('stickers-packs', 'stickers & packs', 'stickers and packs') THEN 'stickers-packs'
  WHEN lower(trim("category")) IN ('exported-pdf', 'exported pdf') THEN 'exported-pdf'
  WHEN lower(trim("category")) IN ('drive-sync', 'drive & sync', 'drive and sync', 'drive sync') THEN 'drive-sync'
  WHEN lower(trim("category")) IN ('my-storefront', 'my storefront') THEN 'my-storefront'
  WHEN lower(trim("category")) IN ('account-billing', 'account & billing', 'account and billing') THEN 'account-billing'
  WHEN lower(trim("category")) IN ('account', 'plans & pricing', 'plans and pricing', 'pricing') THEN 'account-billing'
  WHEN lower(trim("category")) IN ('integrations', 'google integration', 'google sync') THEN 'drive-sync'
  WHEN lower(trim("category")) IN ('features', 'usage', 'content management') THEN 'building-planner'
  WHEN lower(trim("category")) IN ('opening-planner', 'opening my planner', 'opening the planner') THEN 'opening-planner'
  WHEN lower(trim("category")) IN ('links-not-working', 'links not working') THEN 'links-not-working'
  WHEN lower(trim("category")) IN ('using-stickers', 'using my stickers', 'using stickers') THEN 'using-stickers'
  WHEN lower(trim("category")) IN ('printing-cutting', 'printing & cutting', 'printing and cutting') THEN 'printing-cutting'
  WHEN lower(trim("category")) IN ('something-missing', 'something is missing', 'something missing') THEN 'something-missing'
  WHEN lower(trim("category")) IN ('something-else', 'something else', 'general', 'troubleshooting', 'getting started') THEN 'something-else'
  ELSE 'something-else'
END
WHERE "category" NOT IN (
  'building-planner', 'stickers-packs', 'exported-pdf', 'drive-sync',
  'my-storefront', 'account-billing', 'opening-planner', 'links-not-working',
  'using-stickers', 'printing-cutting', 'something-missing', 'something-else'
);