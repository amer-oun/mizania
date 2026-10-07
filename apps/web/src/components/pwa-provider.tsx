"use client";

import { SerwistProvider } from "@serwist/next/react";
import type { ReactNode } from "react";

/**
 * Registers public/sw.js. The worker only exists after a production build
 * (`serwist build`), so registration is disabled in development.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
      {children}
    </SerwistProvider>
  );
}
