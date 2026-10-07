"use client";

import { Direction } from "radix-ui";
import type { ReactNode } from "react";

/** Tells Radix primitives (menus, popovers) the text direction for RTL. */
export function DirectionProvider({ dir, children }: { dir: "ltr" | "rtl"; children: ReactNode }) {
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
