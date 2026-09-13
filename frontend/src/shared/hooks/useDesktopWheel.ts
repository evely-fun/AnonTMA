import { useEffect } from "react";

/**
 * The app is a phone shaped column centred on a wide screen, which leaves most
 * of the page outside it. A wheel turned out there hit nothing, so scrolling
 * only worked if the pointer happened to be over the column, which on a desktop
 * feels broken rather than deliberate.
 *
 * Wheel events that land outside the column are forwarded to whatever it is
 * currently scrolling. Touch and trackpad panning inside the column are
 * untouched: the listener only acts on events the column never saw.
 */
export const useDesktopWheel = (): void => {
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const scroller = (): HTMLElement | null => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      if (!shell) return null;
      const candidates = shell.querySelectorAll<HTMLElement>("*");
      for (const node of candidates) {
        if (node.scrollHeight <= node.clientHeight + 1) continue;
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === "auto" || overflow === "scroll") return node;
      }
      return null;
    };

    const onWheel = (event: WheelEvent) => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      if (!shell || !(event.target instanceof Node)) return;
      if (shell.contains(event.target)) return;
      const target = scroller();
      if (!target) return;
      target.scrollTop += event.deltaY;
      event.preventDefault();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
};
