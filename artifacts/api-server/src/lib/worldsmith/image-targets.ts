/**
 * Backwards-compatible entry point for the WorldSmith image target API.
 * The reusable image-generation service owns the implementation so every
 * image-producing flow resolves the same model configuration and dimensions.
 */
export {
  getWorldsmithImageTarget,
  getWorldsmithPreviewGeneration,
  validateWorldsmithPreviewGenerationConfiguration,
} from "./image-generation-service";
export type { WorldsmithImageTarget } from "./image-generation-service";