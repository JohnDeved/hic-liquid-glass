import { useEffect } from "react";

/**
 * When `pressed` is true, listen for window/tab/context-menu interruptions
 * that can swallow the matching pointerup (and would otherwise leave the
 * pointer-driven UI in a stuck "pressed" state). Fires `release` on any
 * such interrupt.
 *
 * Common triggers:
 *  - right-click during press → contextmenu (no pointerup)
 *  - alt-tab / minimize → window blur (no pointerup)
 *  - tab switch → document visibilitychange (no pointerup)
 */
export function useReleaseOnInterrupt(
  pressed: boolean,
  release: () => void,
  wrapperRef?: { current: HTMLElement | null },
) {
  useEffect(() => {
    if (!pressed) return;
    const fire = () => {
      release();
      // Also cancel any active gesture so use-gesture's internal `down`
      // state resets; otherwise the next click can be dropped.
      const el = wrapperRef?.current;
      if (el) {
        el.dispatchEvent(new PointerEvent("pointercancel", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
        }));
      }
    };
    const onVisibility = () => { if (document.hidden) fire(); };
    window.addEventListener("blur", fire);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("contextmenu", fire);
    return () => {
      window.removeEventListener("blur", fire);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("contextmenu", fire);
    };
  }, [pressed, release, wrapperRef]);
}
