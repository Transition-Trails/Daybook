/**
 * profile-grounding.ts
 *
 * Builds the store identity + voice block injected as grounding into every
 * AI studio system prompt. Centralised here so Theme, Pack, Edition, Trend,
 * and Marketing studios all get the same grounding without duplication.
 *
 * Usage:
 *   const grounding = buildProfileGrounding(profile);
 *   const systemPrompt = `${grounding}\n\n${toolSpecificInstructions}`;
 */
import type { StoreProfile } from "@workspace/db";

export function buildProfileGrounding(
  profile: StoreProfile | null | undefined,
  voiceOverride?: Partial<import("@workspace/db").StoreProfileVoice>,
): string {
  if (!profile && !voiceOverride) return "";

  const facts = profile?.facts ?? {};
  const voice = { ...(profile?.voice ?? {}), ...voiceOverride };

  const lines: string[] = [
    "## Store Identity",
    "(Ground every response in these facts. State them as fact — do not invent prices, claims, or features not listed here.)",
  ];

  if (facts.storeName) lines.push(`Store name: ${facts.storeName}`);
  if (facts.pitch)     lines.push(`One-line pitch: ${facts.pitch}`);
  if (facts.whatTheySell) lines.push(`What they sell: ${facts.whatTheySell}`);
  if (facts.whoItsFor)    lines.push(`Who it's for: ${facts.whoItsFor}`);
  if (facts.differentiators?.length) {
    lines.push(`What makes them different: ${facts.differentiators.join("; ")}`);
  }
  if (facts.links?.length) {
    lines.push(`Links / references: ${facts.links.join(", ")}`);
  }

  lines.push("", "## Brand Voice");
  if (voice.toneTags?.length)      lines.push(`Tone: ${voice.toneTags.join(", ")}`);
  if (voice.wordsWeLove?.length)   lines.push(`Words we love: ${voice.wordsWeLove.join(", ")}`);
  if (voice.wordsToAvoid?.length)  lines.push(`Words to avoid: ${voice.wordsToAvoid.join(", ")}`);
  if (voice.formalityLevel)        lines.push(`Formality level: ${voice.formalityLevel}`);
  if (voice.emojiLevel)            lines.push(`Emoji use: ${voice.emojiLevel}`);
  if (voice.styleSample) {
    lines.push("", `Style sample (match this voice exactly):`, `"${voice.styleSample}"`);
  }

  lines.push(
    "",
    "## Hard rules",
    "- Only state facts that appear above. Never invent specific prices, metrics, or claims.",
    "- Maintain the brand voice defined above from first word to last.",
    "- If a voice field is not set, default to warm, professional, and confident.",
  );

  return lines.join("\n");
}
