import { todayInTunis } from "@mizania/core";
import { getCheckinState } from "@mizania/db/checkin";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CheckinWallets } from "@/components/checkin/checkin-card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Checkin");
  return { title: `${t("pageTitle")} · Mizania` };
}

/** Counting every wallet, at any time of day ("Check all wallets", Wallets tab). */
export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireSession();
  const t = await getTranslations("Checkin");
  const today = todayInTunis();
  const state = await getCheckinState(getDb(), user.id, today);
  const wallet = (await searchParams).wallet;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex flex-col gap-1 py-4">
        <Button asChild variant="ghost" size="sm" className="-ms-3 self-start">
          <Link href="/">
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t("close")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
      </header>
      <main className="flex flex-1 flex-col pb-6">
        <CheckinWallets
          state={state}
          today={today}
          openWalletId={typeof wallet === "string" ? wallet : null}
        />
      </main>
    </div>
  );
}
