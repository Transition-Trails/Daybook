---
name: Daybook Zod schema naming
description: Correct generated Zod validator names for API routes — several don't match intuitive names
---

## Key schema name corrections
These were wrong on first pass and caused TS errors:

| Intuitive name | Actual generated name |
|---|---|
| `AiChatInput` | `AiChatBody` |
| `AiSettingsUpdate` | `UpdateAiSettingsBody` |
| `CheckoutInput` | `CreateCheckoutSessionBody` |
| `GenerationInput` | `GeneratePlannerBody` |

## Rule
Always `grep -n "^export const" lib/api-zod/src/generated/api.ts | grep <keyword>` before writing route imports. The generated names come from the OpenAPI operationId + Body/Params/Response suffix pattern.

**Why:** The OpenAPI spec uses operationId-derived names that don't always match what feels natural when writing route handlers.
