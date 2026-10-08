import type { UserLocale } from "@mizania/db/schema";

import type { AuthEmailKind } from "../auth";
import { emailMessages } from "./messages";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// The app's primary colour (oklch(0.54 0.12 165)) in hex: email clients
// don't support oklch.
const PRIMARY = "#0f8565";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Builds a verification or reset email in the user's language: plain text
 * plus simple HTML (no images, inline styles, RTL for Arabic).
 */
export function renderAuthEmail(
  kind: AuthEmailKind,
  locale: UserLocale,
  { name, url }: { name: string; url: string },
): RenderedEmail {
  const { brand, emails } = emailMessages[locale];
  const m = emails[kind];
  const greeting = m.greeting.replace("{name}", name);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = dir === "rtl" ? "right" : "left";

  const text = [greeting, "", m.intro, "", url, "", m.expiry, "", `— ${brand}`].join("\n");

  const href = escapeHtml(url);
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:480px;background:#ffffff;border-radius:12px;font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#18181b;text-align:${align};">
<tr><td style="padding:24px 24px 0;font-size:22px;font-weight:700;color:${PRIMARY};">${escapeHtml(brand)}</td></tr>
<tr><td style="padding:16px 24px 0;font-size:16px;line-height:1.6;">
<p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;">${escapeHtml(m.intro)}</p>
</td></tr>
<tr><td align="center" style="padding:0 24px 20px;">
<a href="${href}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 24px;border-radius:8px;">${escapeHtml(m.button)}</a>
</td></tr>
<tr><td style="padding:0 24px 24px;font-size:13px;line-height:1.6;color:#52525b;">
<p style="margin:0 0 12px;">${escapeHtml(m.expiry)}</p>
<p style="margin:0 0 4px;">${escapeHtml(m.fallback)}</p>
<p style="margin:0;direction:ltr;text-align:left;word-break:break-all;"><a href="${href}" style="color:${PRIMARY};">${href}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  return { subject: m.subject, text, html };
}
