/** Consume a cross-studio concept once so it cannot leak into a later session. */
export function consumeStudioIdea(): string {
  const idea = sessionStorage.getItem("studioIdea") ?? "";
  if (idea) sessionStorage.removeItem("studioIdea");
  return idea;
}