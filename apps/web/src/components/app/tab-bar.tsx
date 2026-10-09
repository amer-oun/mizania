"use client";

import { ClipboardListIcon, SunIcon, WalletIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Today stays first and is the default screen; a later phase adds More.
const tabs = [
  { href: "/", key: "today", Icon: SunIcon },
  { href: "/plan", key: "plan", Icon: ClipboardListIcon },
  { href: "/wallets", key: "wallets", Icon: WalletIcon },
] as const;

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** Bottom navigation of the signed-in app, within thumb reach. */
export function TabBar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map(({ href, key, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
