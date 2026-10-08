"use client";

import { parseTND } from "@mizania/core";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** An amount in dinars, typed as text ("600", "600.500", "٦٠٠"). */
export function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations("Onboarding");
  const id = useId();
  const invalid = value.trim() !== "" && parseTND(value) === null;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {/* Numbers read left to right in every language, with the currency after them. */}
      <div className="relative" dir="ltr">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className="pr-14 text-lg"
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          {t("currency")}
        </span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {t("money.amountInvalid")}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-primary"
        checked={checked}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span>{children}</span>
    </label>
  );
}
