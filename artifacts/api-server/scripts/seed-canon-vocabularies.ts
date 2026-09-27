import { db, worldsmithWorldsTable } from "@workspace/db";
import { importCanonVocabularyDefaults } from "../src/lib/worldsmith/import-canon-vocabulary-defaults";

const worlds = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable);
let createdVocabularies = 0;
let createdOptions = 0;
for (const world of worlds) {
  const result = await importCanonVocabularyDefaults(world.id);
  createdVocabularies += result.createdVocabularies;
  createdOptions += result.createdOptions;
}
console.log(`Imported ${createdVocabularies} vocabulary sets and ${createdOptions} choices across ${worlds.length} worlds.`);