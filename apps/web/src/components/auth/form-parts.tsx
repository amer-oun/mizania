"use client";

import { EyeIcon, EyeOffIcon, MailWarningIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ComponentProps,
  type ReactNode,
  type SubmitEventHandler,
  useId,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hint ? hintId : undefined} {...props} />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { label: string; hint?: string }) {
  const t = useTranslations("Auth.common");
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          minLength={8}
          maxLength={128}
          required
          dir="ltr"
          className="pe-11"
          aria-describedby={hint ? hintId : undefined}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-y-0 end-0 my-auto me-1"
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          onClick={() => {
            setVisible((v) => !v);
          }}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** An error or success line under a form, announced to screen readers. */
export function FormMessage({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
      )}
    >
      {children}
    </p>
  );
}

/** Shown while offline: these forms need the server until Phase 4. */
export function OfflineNotice() {
  const t = useTranslations("Auth.common");
  const online = useOnline();
  if (online) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
    >
      <WifiOffIcon className="size-4 shrink-0" />
      {t("offline")}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  const t = useTranslations("Auth.common");
  const online = useOnline();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending || !online}>
      {pending ? t("sending") : children}
    </Button>
  );
}

/**
 * An `onSubmit` handler: stops the page reload and runs the async handler
 * with a reader for the form's text fields (trimmed, except passwords).
 */
export function submitHandler(
  handler: (field: (name: string) => string) => Promise<void>,
): SubmitEventHandler<HTMLFormElement> {
  return (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = data.get(name);
      if (typeof value !== "string") return "";
      return /password|confirm/.test(name) ? value : value.trim();
    };
    void handler(field);
  };
}

/** Auth emails from a Gmail address often land in spam (until Phase 10's own domain). */
export function SpamHint() {
  const t = useTranslations("Auth.common");
  return (
    <p
      data-testid="spam-hint"
      className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
    >
      <MailWarningIcon className="size-4 shrink-0" aria-hidden />
      {t("spamHint")}
    </p>
  );
}
