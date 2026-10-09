import { getWalletsOverview } from "@mizania/db/wallets";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RecentTransfers } from "@/components/wallets/recent-transfers";
import { WalletsScreen } from "@/components/wallets/wallets-screen";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Wallets");
  return { title: `${t("title")} · Mizania` };
}

export default async function WalletsPage() {
  const { user } = await requireSession();
  const t = await getTranslations("Wallets");
  const { wallets, recentTransfers } = await getWalletsOverview(getDb(), user.id);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="py-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>
      <main className="flex flex-col pb-6">
        <WalletsScreen wallets={wallets}>
          <RecentTransfers transfers={recentTransfers} wallets={wallets} />
        </WalletsScreen>
      </main>
    </div>
  );
}
