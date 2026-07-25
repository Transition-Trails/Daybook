---
name: Edition duplicate route
description: POST /editions/:id/duplicate copies a platform edition, auto-advances years in name, starts as draft
---

## Endpoint
`POST /api/editions/:id/duplicate` — super_admin only, lives in `artifacts/api-server/src/routes/catalog.ts`.

## Behavior
- Reads source edition, advances all 20XX years in the name by 1 (regex `\b(20\d{2})\b`)
- Creates new draft edition carrying over: tier, sections, priceLow, priceHigh, themes, packs, inserts, products, art, globalAvailable
- Sets: status="draft", origin="licensed", authoredByStoreId=null, revisionOf=<source id>, year=source.year+1
- Never modifies the source edition or anything generated from it

## TypeScript gotcha
`req.params.id` is typed as `string | string[]` in this project's Express augmentation. Must cast:
```typescript
const id = req.params.id as string;
```
Without the cast, `eq(table.id, id)` and using `id` in `.values()` both fail with overload errors.

## JSONB arrays in insert
Must explicitly cast jsonb array fields when inserting a copy:
```typescript
themes: (src.themes ?? []) as string[],
packs:  (src.packs  ?? []) as string[],
// etc.
```
Using `...src` spread fails because spread typing includes `string[]` which conflicts with Drizzle's strict insert types.

## Client API
`catalogApi.duplicateEdition(id)` in `artifacts/admin/src/lib/api.ts` — POST to the route above.
