import type { UserLocale } from "@mizania/db/schema";

import type { AuthEmailKind } from "../auth";

export interface EmailStrings {
  subject: string;
  /** `{name}` is replaced with the user's first name. */
  greeting: string;
  intro: string;
  button: string;
  expiry: string;
  fallback: string;
}

interface LocaleStrings {
  /** Brand name as shown in this language. */
  brand: string;
  emails: Record<AuthEmailKind, EmailStrings>;
}

// Arabic is Tunisian derja (CLAUDE.md). Keep the expiry lines in sync with
// VERIFICATION_LINK_EXPIRES_IN (24 h) and RESET_LINK_EXPIRES_IN (1 h).
export const emailMessages: Record<UserLocale, LocaleStrings> = {
  ar: {
    brand: "ميزانية",
    emails: {
      "verify-email": {
        subject: "أكّد الإيميل متاعك في ميزانية",
        greeting: "عسلامة {name}،",
        intro: "اضغط على الزر باش تأكّد الإيميل متاعك وتبدا تستعمل ميزانية.",
        button: "أكّد الإيميل",
        expiry: "الرابط هذا يخدم 24 ساعة. كان ما عملتش حساب، ما تعمل شي.",
        fallback: "كان الزر ما خدمش، انسخ الرابط هذا في البراوزر:",
      },
      "reset-password": {
        subject: "بدّل كلمة السر متاع ميزانية",
        greeting: "عسلامة {name}،",
        intro:
          "واحد طلب باش يبدّل كلمة السر متاع حسابك في ميزانية. كان إنت، اضغط على الزر باش تختار وحدة جديدة.",
        button: "اختار كلمة سر جديدة",
        expiry:
          "الرابط هذا يخدم ساعة برك. كان موش إنت، ما تعمل شي: كلمة السر متاعك تبقى كيف ما هي.",
        fallback: "كان الزر ما خدمش، انسخ الرابط هذا في البراوزر:",
      },
    },
  },
  fr: {
    brand: "Mizania",
    emails: {
      "verify-email": {
        subject: "Confirme ton email pour Mizania",
        greeting: "Salut {name},",
        intro: "Appuie sur le bouton pour confirmer ton email et commencer avec Mizania.",
        button: "Confirmer mon email",
        expiry:
          "Ce lien est valable 24 heures. Si tu n'as pas créé de compte, ignore simplement cet email.",
        fallback: "Si le bouton ne marche pas, copie ce lien dans ton navigateur :",
      },
      "reset-password": {
        subject: "Change ton mot de passe Mizania",
        greeting: "Salut {name},",
        intro:
          "Quelqu'un a demandé à changer le mot de passe de ton compte Mizania. Si c'est toi, appuie sur le bouton pour en choisir un nouveau.",
        button: "Choisir un nouveau mot de passe",
        expiry:
          "Ce lien est valable 1 heure. Si ce n'est pas toi, ignore cet email : ton mot de passe ne change pas.",
        fallback: "Si le bouton ne marche pas, copie ce lien dans ton navigateur :",
      },
    },
  },
  en: {
    brand: "Mizania",
    emails: {
      "verify-email": {
        subject: "Confirm your email for Mizania",
        greeting: "Hi {name},",
        intro: "Tap the button to confirm your email and start using Mizania.",
        button: "Confirm my email",
        expiry:
          "This link works for 24 hours. If you didn't create an account, you can ignore this email.",
        fallback: "If the button doesn't work, copy this link into your browser:",
      },
      "reset-password": {
        subject: "Reset your Mizania password",
        greeting: "Hi {name},",
        intro:
          "Someone asked to reset the password for your Mizania account. If it was you, tap the button to choose a new one.",
        button: "Choose a new password",
        expiry:
          "This link works for 1 hour. If it wasn't you, ignore this email: your password stays the same.",
        fallback: "If the button doesn't work, copy this link into your browser:",
      },
    },
  },
};
