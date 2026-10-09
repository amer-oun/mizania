import { getWalletsOverview } from "@mizania/db/wallets";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { TransferForm } from "@/components/wallets/transfer-form";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wallets");
  return { title: `${t("transferTitle")} · Mizania` };
}

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const { user } = await requireSession();
  const t = await getTranslations("Wallets");
  const { wallets } = await getWalletsOverview(getDb(), user.id);
  const active = wallets.filter((w) => !w.archived);

  // ?from=…&to=… pre-fill the form (the "Withdraw cash" shortcut). Anything
  // that isn't one of this user's active wallets is ignored.
  const params = await searchParams;
  const own = (value: string | string[] | undefined) =>
    typeof value === "string" && active.some((w) => w.id === value) ? value : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex flex-col gap-1 py-4">
        <Button asChild variant="ghost" size="sm" className="-ms-3 self-start">
          <Link href="/wallets">
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("transferTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("transferSubtitle")}</p>
      </header>
      <main className="pb-6">
        <TransferForm wallets={active} initialFrom={own(params.from)} initialTo={own(params.to)} />
      </main>
    </div>
  );
}
