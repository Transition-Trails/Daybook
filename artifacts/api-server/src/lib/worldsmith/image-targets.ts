/**
 * Backwards-compatible entry point for the WorldSmith image target API.
 * The reusable image-generation service owns the implementation so every
 * image-producing flow resolves the same model configuration and dimensions.
 */
import {
  resolveImageGenerationMetadata,
  type ImageGenerationMetadata,
  type ImageGenerationQuality,
} from "../ai-proxy";
import { getWorldsmithImageTarget, type WorldsmithImageTarget } from "./image-generation-service";

export {
  getWorldsmithImageTarget,
  getWorldsmithPreviewGeneration,
  validateWorldsmithPreviewGenerationConfiguration,
} from "./image-generation-service";
export type { WorldsmithImageTarget } from "./image-generation-service";

const ALLOWED_QUALITY = new Set<ImageGenerationQuality>(["low", "medium", "high", "standard", "hd"]);

function configuredProductionQuality(requestedQuality?: ImageGenerationQuality): ImageGenerationQuality {
  const quality = (requestedQuality ?? process.env.WS_PRODUCTION_QUALITY ?? process.env.SPEC_PREVIEW_QUALITY ?? "medium")
    .trim() as ImageGenerationQuality;
  if (!ALLOWED_QUALITY.has(quality)) {
    throw new Error(`Unsupported production image quality "${quality}". Supported values: low, medium, high, standard, hd.`);
  }
  return quality;
}

/**
 * Resolve final-art settings separately from concept-board preview settings.
 * The target stays print-derived, while a caller can request a supported
 * quality tier without selecting a provider or model directly.
 */
export function getWorldsmithProductionGeneration(
  componentType: string | undefined,
  orientation?: string | null,
  requestedQuality?: ImageGenerationQuality,
): { target: WorldsmithImageTarget; metadata: ImageGenerationMetadata } {
  const target = getWorldsmithImageTarget(componentType, orientation);
  return {
    target,
    metadata: resolveImageGenerationMetadata({
      size: target.size,
      quality: configuredProductionQuality(requestedQuality),
    }),
  };
}
