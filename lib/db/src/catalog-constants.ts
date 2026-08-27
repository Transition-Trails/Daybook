/** Shared catalog vocabularies used by validation, persistence, and controls. */
export const SPINE_BINDING_TYPES = ["coil", "twin-loop", "disc", "3-ring"] as const;
export type SpineBindingType = (typeof SPINE_BINDING_TYPES)[number];

export const SPINE_FINISHES = [
  { value: "gold", label: "Gold" },
  { value: "rose-gold", label: "Rose gold" },
  { value: "silver", label: "Silver" },
  { value: "copper", label: "Copper" },
  { value: "bronze", label: "Bronze" },
  { value: "white", label: "White" },
  { value: "matte-black", label: "Matte black" },
] as const;
export type SpineFinish = (typeof SPINE_FINISHES)[number]["value"];

export const SPINE_FINISH_VALUES = SPINE_FINISHES.map(({ value }) => value) as [
  SpineFinish,
  ...SpineFinish[],
];

export const spineFinishLabel = (value: string): string =>
  SPINE_FINISHES.find((finish) => finish.value === value)?.label ?? value;