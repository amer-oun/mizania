import { getTranslations } from "next-intl/server";

export default async function WalletsLoading() {
  const t = await getTranslations("Wallets");
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-[env(safe-area-inset-top)]">
      <div className="h-8 w-40 py-4" />
      <p className="sr-only" role="status">
        {t("loading")}
      </p>
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-11 animate-pulse rounded-md bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
