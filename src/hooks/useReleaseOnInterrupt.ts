import { useEffect } from "react";

/**
 * Fires `release` if a window/tab/context-menu interrupt swallows the
 * matching pointerup (blur, visibility change, contextmenu). Without
 * this, the pointer-driven UI gets stuck in a "pressed" state.
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
