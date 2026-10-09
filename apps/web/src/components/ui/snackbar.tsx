"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export interface SnackbarMessage {
  /** Changes for every new message, so the timer starts again. */
  id: number;
  text: string;
  action?: { label: string; run: () => void } | undefined;
}

const VISIBLE_MS = 5_000;

/** A short message above the tab bar, with an optional action (Undo). */
export function Snackbar({
  message,
  onClose,
}: {
  message: SnackbarMessage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, VISIBLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
    >
      {message && (
        <div
          className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
          data-testid="snackbar"
        >
          <span>{message.text}</span>
          {message.action && (
            <Button
              variant="ghost"
              size="sm"
              className="text-background hover:bg-background/10 hover:text-background"
              onClick={() => {
                message.action?.run();
                onClose();
              }}
            >
              {message.action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
