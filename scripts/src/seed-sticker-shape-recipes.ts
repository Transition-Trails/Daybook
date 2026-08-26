import { db, STARTER_SHAPE_RECIPES, stickerShapeRecipesTable } from "@workspace/db";
import { pathToFileURL } from "node:url";

export { STARTER_SHAPE_RECIPES } from "@workspace/db";

export async function seedStarterShapeRecipes(): Promise<void> {
  await db.insert(stickerShapeRecipesTable).values([...STARTER_SHAPE_RECIPES]).onConflictDoNothing();
}

async function main() {
  await seedStarterShapeRecipes();
  console.log(`Seeded ${STARTER_SHAPE_RECIPES.length} starter sticker shape recipes.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}