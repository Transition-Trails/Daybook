import { db, fontsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { TypographyChoice } from "./types";

export class TypographyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypographyValidationError";
  }
}

/**
 * Resolves externally supplied font IDs back through the catalog. This keeps
 * persisted typography limited to compiler-safe family and role data.
 */
export async function resolveTypographyChoices(value: unknown): Promise<TypographyChoice[]> {
  if (!Array.isArray(value)) {
    throw new TypographyValidationError("typography must be an array of font selections.");
  }

  const fontIds = value.map((choice) => {
    if (!choice || typeof choice !== "object" || typeof (choice as { fontId?: unknown }).fontId !== "string") {
      throw new TypographyValidationError("Each typography selection must include a fontId.");
    }
    return (choice as { fontId: string }).fontId.trim();
  });

  if (fontIds.some((fontId) => !fontId)) {
    throw new TypographyValidationError("Each typography selection must include a non-empty fontId.");
  }
  if (new Set(fontIds).size !== fontIds.length) {
    throw new TypographyValidationError("Typography selections cannot include the same font more than once.");
  }
  if (fontIds.length === 0) return [];

  const fonts = await db
    .select({
      id: fontsTable.id,
      familyName: fontsTable.familyName,
      curatedPairings: fontsTable.curatedPairings,
    })
    .from(fontsTable)
    .where(inArray(fontsTable.id, fontIds));

  if (fonts.length !== fontIds.length) {
    throw new TypographyValidationError("One or more selected fonts are no longer available in the catalog.");
  }

  const byId = new Map(fonts.map((font) => [font.id, font]));
  return fontIds.map((fontId) => {
    const font = byId.get(fontId)!;
    return {
      fontId: font.id,
      family: font.familyName,
      roles: (font.curatedPairings ?? [])
        .filter((pairing) => typeof pairing?.role === "string" && pairing.role.trim())
        .map((pairing) => ({
          role: pairing.role.trim(),
          ...(pairing.weight?.trim() ? { weight: pairing.weight.trim() } : {}),
        })),
    };
  });
}