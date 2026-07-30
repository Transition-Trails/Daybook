/**
 * useFocusTrap — lightweight keyboard focus trap for overlay panels.
 *
 * Behaviour when `active` becomes true:
 *   - Saves document.activeElement as the restoration target.
 *   - Moves focus to the first focusable descendant of `containerRef`
 *     (deferred one animation frame so CSS transitions can start painting
 *     before a screen reader announces the panel).
 *   - Intercepts Tab / Shift+Tab to cycle within the container, wrapping at
 *     both ends.
 *   - If focus ever leaves the container while the trap is active (e.g. from a
 *     browser chrome interaction), the next Tab keystroke brings it back.
 *
 * Behaviour when `active` becomes false:
 *   - Restores focus to `triggerRef.current` if supplied, otherwise to the
 *     element that was active before the trap engaged.
 *
 * @param containerRef  Ref to the overlay root element.
 * @param active        Mirror of the open/visible boolean.
 * @param triggerRef    Optional explicit element to restore focus to on close
 *                      (use for the hamburger button in StudioLayout where
 *                      click-to-focus is unreliable on macOS Safari).
 */
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), ' +
  "select:not([disabled]), textarea:not([disabled]), button:not([disabled]), " +
  "iframe, object, embed, [contenteditable='true'], " +
  "[tabindex]:not([tabindex='-1'])";

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      // Skip elements inside aria-hidden subtrees (e.g. animated scrim)
      !el.closest("[aria-hidden='true']") &&
      // Skip elements that are themselves aria-hidden
      el.getAttribute("aria-hidden") !== "true",
  );
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  const savedFocusRef = useRef<HTMLElement | null>(null);

  // ── Save + move focus on open; restore on close ──────────────────────────
  useEffect(() => {
    if (!active) {
      // Restore focus to the explicit trigger (if supplied) or to whatever
      // had focus before the trap engaged.
      const restoreTarget = triggerRef?.current ?? savedFocusRef.current;
      restoreTarget?.focus();
      savedFocusRef.current = null;
      return;
    }

    savedFocusRef.current = document.activeElement as HTMLElement | null;

    // Defer one frame: let the browser paint the open transition before
    // moving focus, so screen readers announce the newly visible content.
    const rafId = requestAnimationFrame(() => {
      const focusable = getFocusable(containerRef.current);
      const target = focusable[0] ?? containerRef.current;
      target?.focus();
    });
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── Tab trap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable(containerRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      const inside = containerRef.current?.contains(document.activeElement) ?? false;

      if (e.shiftKey) {
        // Shift+Tab: wrap last → ... or pull stray focus back to last
        if (!inside || document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap last → first or pull stray focus back to first
        if (!inside || document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
