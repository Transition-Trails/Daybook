export function canForceSuggestionRefresh(
  forceRefresh: boolean | undefined,
  isSuperAdmin: boolean | undefined,
): boolean {
  return forceRefresh === true && isSuperAdmin === true;
}