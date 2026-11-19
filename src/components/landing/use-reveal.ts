import { useEffect } from "react";
import type { RefObject } from "react";

/** Hides the parts that are below the screen, then watches them. Parts of one group come in one after the other. */
const armPartsBelowScreen = (
  container: HTMLElement,
  observer: IntersectionObserver
) => {
  const partsSeen = new Map<Element, number>();
  for (const part of container.querySelectorAll<HTMLElement>("[data-reveal]")) {
    if (part.getBoundingClientRect().top > window.innerHeight) {
      const group = part.parentElement ?? container;
      const position = partsSeen.get(group) ?? 0;
      partsSeen.set(group, position + 1);
      part.style.setProperty("--d", String(Math.min(position, 5)));
      part.dataset.reveal = "armed";
      observer.observe(part);
    }
  }
};

/**
 * Shows the parts with `data-reveal` when they come into the screen, one time each.
 * It hides only the parts that are below the screen when it starts, so nothing flashes,
 * and nothing stays hidden when the script does not run.
 */
export const useReveal = (root: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { isIntersecting, target } of entries) {
          if (isIntersecting && target instanceof HTMLElement) {
            target.dataset.reveal = "in";
            observer.unobserve(target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );

    const container = root.current;
    const lessMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (container !== null && !lessMotion) {
      armPartsBelowScreen(container, observer);
    }

    return () => {
      observer.disconnect();
    };
  }, [root]);
};
