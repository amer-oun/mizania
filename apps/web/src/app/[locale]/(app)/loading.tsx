import { getTranslations } from "next-intl/server";

export default async function TodayLoading() {
  const t = await getTranslations("Today");
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[env(safe-area-inset-top)]">
      <div className="h-16" />
      <p className="sr-only" role="status">
        {t("loading")}
      </p>
      <div className="h-52 animate-pulse rounded-xl bg-muted" />
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
