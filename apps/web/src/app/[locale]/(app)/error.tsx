"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function TodayError({ reset }: { reset: () => void }) {
  const t = useTranslations("Today");
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p role="alert">{t("loadError")}</p>
      <Button
        variant="outline"
        onClick={() => {
          reset();
        }}
      >
        {t("retry")}
      </Button>
    </div>
  );
}
