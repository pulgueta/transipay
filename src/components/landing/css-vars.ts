import type { CSSProperties } from "react";

/** A style object that can also set CSS custom properties, for example `{ "--i": 2 }`. */
export type StyleWithVars = CSSProperties &
  Record<`--${string}`, string | number>;

/** Types a style object that sets CSS custom properties. */
export const cssVars = (style: StyleWithVars): CSSProperties => style;
