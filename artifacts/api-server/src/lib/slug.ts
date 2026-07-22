export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function uniqueSlug(base: string, suffix?: string): string {
  const b = toSlug(base);
  return suffix ? `${b}-${suffix}` : b;
}
