import { APP_TIME_ZONE } from "@mizania/core";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import type messages from "../../messages/en.json";
import { routing } from "./routing";

export default getRequestConfig(async () => {
  // The [locale] segment holds the root layout, so it is a root param.
  const requested = await rootParams.locale();
  if (!hasLocale(routing.locales, requested)) notFound();
  const locale = requested;
  const loaded = (await import(`../../messages/${locale}.json`)) as { default: typeof messages };

  return {
    locale,
    // All dates are shown in Tunisia's time zone, wherever the device is.
    timeZone: APP_TIME_ZONE,
    messages: loaded.default,
  };
});
