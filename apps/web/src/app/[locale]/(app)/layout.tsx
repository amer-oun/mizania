import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { TabBar } from "@/components/app/tab-bar";
import { redirect } from "@/i18n/navigation";
import { requireSession } from "@/lib/session";

// Every page in this group needs a signed-in user who has finished
// onboarding. The proxy already sent visitors without a session cookie to
// sign-in; this checks the session itself.
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  if (!user.onboardedAt) redirect({ href: "/onboarding", locale: await getLocale() });

  return (
    <>
      {/* Room at the bottom for the tab bar. */}
      <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <TabBar />
    </>
  );
}
