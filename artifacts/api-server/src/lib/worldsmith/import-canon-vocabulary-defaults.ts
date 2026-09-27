import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, wsVocabulariesTable, wsVocabularyOptionsTable } from "@workspace/db";
import { getCanonVocabularyDefaults } from "./canon-metadata";

/**
 * Imports the choices already shown by the Canon editor and metadata API.
 * Existing type-specific sets are deliberately left completely unchanged:
 * an empty or inactive set may reflect an editor's decision.
 */
export async function importCanonVocabularyDefaults(worldId: string, recordType?: string) {
  const defaults = getCanonVocabularyDefaults().filter(item => !recordType || item.recordType === recordType);
  return db.transaction(async tx => {
    const existing = await tx.select({
      id: wsVocabulariesTable.id,
      worldId: wsVocabulariesTable.worldId,
      key: wsVocabulariesTable.key,
      recordType: wsVocabulariesTable.recordType,
      active: wsVocabulariesTable.active,
    }).from(wsVocabulariesTable).where(or(
      eq(wsVocabulariesTable.worldId, worldId), isNull(wsVocabulariesTable.worldId),
    ));
    const legacy = existing.filter(row => row.recordType == null);
    const legacyOptions = legacy.length ? await tx.select({
      vocabularyId: wsVocabularyOptionsTable.vocabularyId,
      worldId: wsVocabularyOptionsTable.worldId,
      key: wsVocabularyOptionsTable.key,
      label: wsVocabularyOptionsTable.label,
      description: wsVocabularyOptionsTable.description,
      active: wsVocabularyOptionsTable.active,
      displayOrder: wsVocabularyOptionsTable.displayOrder,
    }).from(wsVocabularyOptionsTable).where(and(
      inArray(wsVocabularyOptionsTable.vocabularyId, legacy.map(row => row.id)),
      or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, worldId)),
    )) : [];
    const missing = defaults.filter(item => !existing.some(
      row => row.worldId === worldId && row.key === item.key && row.recordType === item.recordType,
    ));
    const prepared = missing.map(item => {
      const shared = legacy.filter(row => row.key === item.key);
      const sharedById = new Map(shared.map(row => [row.id, row]));
      const inherited = legacyOptions.filter(option => sharedById.has(option.vocabularyId))
        .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
      const options = new Map<string, { key: string; label: string; description: string; active: boolean }>();
      // Global labels first, then a world's edits. Either active source can permit
      // a value; inactive shared choices must not become active merely because
      // that key also happens to appear in the built-in defaults.
      for (const option of [...inherited.filter(row => row.worldId == null), ...inherited.filter(row => row.worldId != null)]) {
        const previous = options.get(option.key);
        options.set(option.key, {
          key: option.key, label: option.label, description: option.description,
          active: Boolean(previous?.active || (option.active && sharedById.get(option.vocabularyId)?.active)),
        });
      }
      for (const option of item.options) {
        if (!options.has(option.key)) options.set(option.key, { ...option, description: "", active: true });
      }
      return { item, active: shared.length ? shared.some(row => row.active) : true, options: [...options.values()] };
    }).filter(row => row.options.length);
    const inserted = prepared.length ? await tx.insert(wsVocabulariesTable).values(prepared.map(({ item, active }) => ({
      id: randomUUID(),
      worldId,
      recordType: item.recordType,
      scope: "world",
      key: item.key,
      label: item.label,
      active,
    }))).onConflictDoNothing().returning({
      id: wsVocabulariesTable.id,
      key: wsVocabulariesTable.key,
      recordType: wsVocabulariesTable.recordType,
    }) : [];
    const defaultsByField = new Map(prepared.map(row => [`${row.item.recordType}\0${row.item.key}`, row]));
    const newOptions = inserted.flatMap(vocab => (defaultsByField.get(`${vocab.recordType}\0${vocab.key}`)?.options ?? [])
      .map((option, displayOrder) => ({
        id: randomUUID(),
        vocabularyId: vocab.id,
        worldId,
        key: option.key,
        label: option.label,
        description: option.description,
        displayOrder,
        active: option.active,
      })));
    const addedOptions = newOptions.length ? await tx.insert(wsVocabularyOptionsTable).values(newOptions)
      .onConflictDoNothing().returning({ id: wsVocabularyOptionsTable.id }) : [];
    return {
      createdVocabularies: inserted.length,
      createdOptions: addedOptions.length,
      skippedVocabularies: defaults.length - inserted.length,
    };
  });
}