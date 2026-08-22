type SpecNavigationGuard = () => boolean;

let activeSpecNavigationGuard: SpecNavigationGuard | null = null;
let bypassNextNavigationGuard = false;

/**
 * The editor is rendered below the app router, so it registers its dirty-state
 * guard here for the router's aroundNav callback to consult. This also covers
 * links in the persistent EditorialShell while the editor is mounted.
 */
export function registerSpecNavigationGuard(guard: SpecNavigationGuard) {
  activeSpecNavigationGuard = guard;
  return () => {
    if (activeSpecNavigationGuard === guard) activeSpecNavigationGuard = null;
  };
}

export function confirmSpecNavigation() {
  if (bypassNextNavigationGuard) {
    bypassNextNavigationGuard = false;
    return true;
  }
  return activeSpecNavigationGuard ? activeSpecNavigationGuard() : true;
}

/** Use after a confirmed destructive action has already discarded local edits. */
export function bypassNextSpecNavigationGuard() {
  bypassNextNavigationGuard = true;
}