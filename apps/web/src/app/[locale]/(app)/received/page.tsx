import { todayInTunis } from "@mizania/core";
import { getQuickLogOptions } from "@mizania/db/expenses";
import { getReceiveOptions } from "@mizania/db/received";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ReceiveFlow } from "@/components/received/receive-flow";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Received");
  return { title: `${t("title")} · Mizania` };
}

export default async function ReceivedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireSession();
  const t = await getTranslations("Received");
  const db = getDb();
  const today = todayInTunis();
  const [options, { wallets }] = await Promise.all([
    getReceiveOptions(db, user.id, today),
    getQuickLogOptions(db, user.id),
  ]);
  // ?kind=month: "Yes, it arrived" on the late-transfer question.
  const kind = (await searchParams).kind === "month" ? "month" : options?.defaultKind;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex flex-col gap-1 py-4">
        <Button asChild variant="ghost" size="sm" className="-ms-3 self-start">
          <Link href="/">
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>
      <main className="flex flex-1 flex-col pb-6">
        {options && kind ? (
          <ReceiveFlow options={options} wallets={wallets} initialKind={kind} />
        ) : (
          <p className="text-muted-foreground">{t("noCycle")}</p>
        )}
      </main>
    </div>
  );
}
