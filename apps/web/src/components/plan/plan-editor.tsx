"use client";

import {
  envelopeLimits,
  fixedCostLimits,
  formatTypedTND,
  type PlanDraftItem,
  type PlanItemLimits,
  type PlanPreview,
  previewPlan,
} from "@mizania/core";
import type { PlanCategory, PlanEditor as PlanEditorData } from "@mizania/db/plan";
import { LockIcon, PiggyBankIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState, useTransition } from "react";

import { savePlanAction } from "@/app/actions/month-plan";
import { AmountDisplay, Keypad, useAmountEntry } from "@/components/amount/amount-entry";
import { CategoryIcon } from "@/components/quick-log/category-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Amount, useFormatAmount } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WalletActionError } from "@/lib/wallet-action";

// The month plan editor: fixed costs, envelopes and one savings line, with a
// live preview of today's amount. Changes stay in a draft until "Save my
// plan". Every number comes from packages/core (previewPlan, the limits);
// the db checks the same limits when saving.

const free: PlanItemLimits = { locked: false, min: 0, removable: true };

interface Editing {
  item: PlanDraftItem;
  /** Not in the draft yet: added on OK. */
  adding: boolean;
}

const planErrors = ["invalid", "not-found", "signed-out", "server"] as const;
type PlanError = (typeof planErrors)[number];
const planError = (error: WalletActionError): PlanError =>
  planErrors.find((e) => e === error) ?? "server";

export function PlanEditor({ data, backTo }: { data: PlanEditorData; backTo: "/" | "/plan" }) {
  const t = useTranslations("PlanEdit");
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const formatAmount = useFormatAmount();
  const [draft, setDraft] = useState<PlanDraftItem[]>(() =>
    data.input.planItems.map(({ id, kind, categoryId, amountMillimes }) => ({
      id,
      kind,
      categoryId,
      amountMillimes,
    })),
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  const [picking, setPicking] = useState<"fixed" | "envelope" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PlanError | null>(null);

  // New envelopes cover spending from when the plan is saved: after
  // everything logged so far.
  const preview = useMemo(() => {
    const saveAt = data.input.transactions.reduce((latest, t) => Math.max(latest, t.at), 0) + 1;
    return (items: readonly PlanDraftItem[]) =>
      previewPlan({
        summary: data.input,
        weeklyMode: data.weeklyMode,
        weekAllowance: data.weekAllowance,
        draft: items,
        now: saveAt,
      });
  }, [data]);
  const current = useMemo(() => preview(draft), [preview, draft]);
  const before = new Map(data.input.planItems.map((i) => [i.id, i]));
  const changed =
    draft.length !== before.size ||
    draft.some((i) => before.get(i.id)?.amountMillimes !== i.amountMillimes);

  const categoryOf = (item: { categoryId: string | null }) =>
    data.categories.find((c) => c.id === item.categoryId);
  const fixedStatus = (item: PlanDraftItem) => data.plan.fixedCosts.find((c) => c.id === item.id);
  const envelopeStatus = (item: PlanDraftItem) =>
    before.has(item.id)
      ? data.plan.envelopes.find((e) => e.categoryId === item.categoryId)
      : undefined;

  function nameOf(item: PlanDraftItem): string {
    if (item.kind === "savings") return t("savings");
    const named = categoryOf(item) ?? fixedStatus(item) ?? envelopeStatus(item);
    return named?.names?.[locale] ?? "";
  }
  function iconOf(item: PlanDraftItem): string {
    return categoryOf(item)?.icon ?? fixedStatus(item)?.icon ?? envelopeStatus(item)?.icon ?? "";
  }
  function limitsOf(item: PlanDraftItem): PlanItemLimits {
    const fixed = fixedStatus(item);
    if (fixed) return fixedCostLimits(fixed);
    const envelope = envelopeStatus(item);
    return envelope ? envelopeLimits(envelope) : free;
  }
  /** What's already paid or spent, under the name. */
  function usedOf(item: PlanDraftItem): string | null {
    const fixed = fixedStatus(item);
    if (fixed?.paid) return t("paid");
    if (fixed && fixed.paidSoFar > 0)
      return t("paidSoFar", { amount: formatAmount(fixed.paidSoFar) });
    const envelope = envelopeStatus(item);
    if (envelope && envelope.spent > 0) {
      return t("spentSoFar", { amount: formatAmount(envelope.spent) });
    }
    return null;
  }

  const withAmount = (items: PlanDraftItem[], item: PlanDraftItem, adding: boolean) =>
    adding ? [...items, item] : items.map((i) => (i.id === item.id ? item : i));

  function startAdding(kind: PlanDraftItem["kind"], category: PlanCategory | null, amount = 0) {
    setPicking(null);
    setEditing({
      adding: true,
      item: {
        id: crypto.randomUUID(),
        kind,
        categoryId: category?.id ?? null,
        amountMillimes: amount,
      },
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof savePlanAction>>;
      try {
        result = await savePlanAction({ cycleId: data.cycleId, items: draft });
      } catch {
        result = { ok: false, error: "server" };
      }
      if (!result.ok) {
        setError(planError(result.error));
        return;
      }
      router.push(backTo);
      router.refresh();
    });
  }

  const inDraft = (category: PlanCategory) => draft.some((i) => i.categoryId === category.id);
  const groceries = data.groceries;
  const groceriesCategory = groceries
    ? data.categories.find((c) => c.id === groceries.categoryId)
    : undefined;
  const suggestGroceries =
    groceries && groceriesCategory && !inDraft(groceriesCategory) ? groceries : null;
  const savings = draft.find((i) => i.kind === "savings");

  const row = (item: PlanDraftItem) => {
    const limits = limitsOf(item);
    const was = before.get(item.id)?.amountMillimes;
    const used = usedOf(item);
    const content = (
      <>
        {item.kind === "savings" ? (
          <PiggyBankIcon className="size-5 text-muted-foreground" aria-hidden />
        ) : (
          <CategoryIcon name={iconOf(item)} className="text-muted-foreground" />
        )}
        <span className="flex min-w-0 flex-1 flex-col text-start">
          <span className="truncate text-sm font-medium">{nameOf(item)}</span>
          {limits.locked ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockIcon className="size-3" aria-hidden />
              {fixedStatus(item)?.paid ? t("lockedPaid") : t("lockedOver")}
            </span>
          ) : (
            used && <span className="truncate text-xs text-muted-foreground">{used}</span>
          )}
        </span>
        <span className="flex flex-col items-end">
          <Amount millimes={item.amountMillimes} className="text-sm font-semibold" />
          {was !== undefined && was !== item.amountMillimes && (
            <Amount millimes={was} className="text-xs text-muted-foreground line-through" />
          )}
        </span>
      </>
    );
    return (
      <li key={item.id} data-testid="plan-item">
        {limits.locked ? (
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">{content}</div>
        ) : (
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 px-4 py-2 outline-none focus-visible:bg-accent active:bg-accent"
            aria-label={t("editLabel", { name: nameOf(item) })}
            onClick={() => {
              setEditing({ item, adding: false });
            }}
          >
            {content}
          </button>
        )}
      </li>
    );
  };

  const section = (id: string, title: string, items: PlanDraftItem[], extra: ReactNode) => (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      {items.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border">{items.map(row)}</ul>
      )}
      {extra}
    </section>
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <PreviewSummary preview={current} testId="plan-preview" />
      </div>

      {section(
        "edit-fixed",
        t("fixedTitle"),
        draft.filter((i) => i.kind === "fixed"),
        <AddButton
          label={t("addFixed")}
          onClick={() => {
            setPicking("fixed");
          }}
        />,
      )}

      {section(
        "edit-envelopes",
        t("envelopesTitle"),
        draft.filter((i) => i.kind === "envelope"),
        <>
          {suggestGroceries && groceriesCategory && (
            <button
              type="button"
              className="flex min-h-14 items-center gap-3 rounded-xl border border-dashed px-4 py-2 text-start"
              aria-label={t("suggestedLabel", {
                name: groceriesCategory.names[locale],
                amount: formatAmount(suggestGroceries.suggested),
              })}
              data-testid="groceries-suggestion"
              onClick={() => {
                startAdding("envelope", groceriesCategory, suggestGroceries.suggested);
              }}
            >
              <CategoryIcon name={groceriesCategory.icon} className="text-muted-foreground" />
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium">{groceriesCategory.names[locale]}</span>
                <span className="text-xs text-muted-foreground">
                  {t("suggested", { amount: formatAmount(suggestGroceries.suggested) })}
                </span>
              </span>
              <PlusIcon className="size-5 text-primary" aria-hidden />
            </button>
          )}
          <AddButton
            label={t("addEnvelope")}
            onClick={() => {
              setPicking("envelope");
            }}
          />
        </>,
      )}

      {section(
        "edit-savings",
        t("savingsTitle"),
        savings ? [savings] : [],
        !savings && (
          <AddButton
            label={t("addSavings")}
            onClick={() => {
              startAdding("savings", null);
            }}
          />
        ),
      )}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 mt-auto flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${error}`)}
          </p>
        )}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="lg" className="flex-1">
            <Link href={backTo}>{t("cancel")}</Link>
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!changed || pending || !online}
            onClick={save}
          >
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      {picking && (
        <PickSheet
          title={picking === "fixed" ? t("pickFixed") : t("pickEnvelope")}
          categories={data.categories.filter((c) => c.group === picking && !inDraft(c))}
          onPick={(category) => {
            startAdding(picking, category);
          }}
          onClose={() => {
            setPicking(null);
          }}
        />
      )}

      {editing && (
        <AmountSheet
          key={editing.item.id}
          name={nameOf(editing.item)}
          item={editing.item}
          limits={limitsOf(editing.item)}
          adding={editing.adding}
          previewFor={(amount) =>
            amount === null
              ? current
              : preview(
                  withAmount(draft, { ...editing.item, amountMillimes: amount }, editing.adding),
                )
          }
          onDone={(amount) => {
            setDraft((items) =>
              withAmount(items, { ...editing.item, amountMillimes: amount }, editing.adding),
            );
            setEditing(null);
          }}
          onRemove={() => {
            setDraft((items) => items.filter((i) => i.id !== editing.item.id));
            setEditing(null);
          }}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" className="self-start text-primary" onClick={onClick}>
      <PlusIcon aria-hidden />
      {label}
    </Button>
  );
}

/** Today's amount with the draft (the current one struck through when it changes). */
function PreviewSummary({ preview, testId }: { preview: PlanPreview; testId: string }) {
  const t = useTranslations("PlanEdit");
  const formatAmount = useFormatAmount();
  const { before, after, fromNextWeek } = preview;
  const moved = after.today.allowance !== before.today.allowance;

  return (
    <div className="flex flex-col gap-1" data-testid={testId} aria-live="polite">
      {after.poolNow < 0 ? (
        <p className="font-semibold text-destructive" data-testid="preview-over">
          {t("over", { amount: formatAmount(-after.poolNow) })}
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-muted-foreground">{t("today")}</span>
          {moved && (
            <Amount
              millimes={before.today.allowance}
              className="text-sm text-muted-foreground line-through"
            />
          )}
          <span data-testid="preview-today">
            <Amount millimes={after.today.allowance} className="text-xl font-bold" />
          </span>
        </div>
      )}
      <p className="text-xs text-muted-foreground" data-testid="preview-set-aside">
        {t("setAside", { amount: formatAmount(after.reserved) })}
      </p>
      {fromNextWeek && (
        <p className="text-xs text-primary" data-testid="preview-next-week">
          {t("fromNextWeek")}
        </p>
      )}
    </div>
  );
}

function PickSheet({
  title,
  categories,
  onPick,
  onClose,
}: {
  title: string;
  categories: PlanCategory[];
  onPick: (category: PlanCategory) => void;
  onClose: () => void;
}) {
  const t = useTranslations("PlanEdit");
  const locale = useLocale();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} className="gap-3" data-testid="plan-pick">
        <DialogTitle>{title}</DialogTitle>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nothingToAdd")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start active:bg-accent"
                  onClick={() => {
                    onPick(category);
                  }}
                >
                  <CategoryIcon name={category.icon} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{category.names[locale]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The amount of one plan item on the keypad, with today's amount as it
 * would be. It can't go below what's already used; a used envelope is
 * closed at that instead of removed.
 */
function AmountSheet({
  name,
  item,
  limits,
  adding,
  previewFor,
  onDone,
  onRemove,
  onClose,
}: {
  name: string;
  item: PlanDraftItem;
  limits: PlanItemLimits;
  adding: boolean;
  previewFor: (amount: number | null) => PlanPreview;
  onDone: (amount: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("PlanEdit");
  const formatAmount = useFormatAmount();
  const entry = useAmountEntry(item.amountMillimes > 0 ? formatTypedTND(item.amountMillimes) : "");
  const { amount } = entry;
  const valid = amount !== null && amount > 0 && amount >= limits.min;
  const closeAt = !limits.removable && item.kind === "envelope" && limits.min > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        className="gap-3"
        data-testid="plan-amount-sheet"
        {...entry.handlers}
      >
        <DialogTitle>{name}</DialogTitle>
        <p className="text-center text-sm text-muted-foreground">{t("amountLabel")}</p>
        <AmountDisplay entry={entry} testId="plan-amount" />
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <PreviewSummary preview={previewFor(valid ? amount : null)} testId="sheet-preview" />
        </div>
        {limits.min > 0 && (
          <p
            className={cn(
              "text-xs",
              amount !== null && amount < limits.min ? "text-destructive" : "text-muted-foreground",
            )}
            data-testid="plan-amount-min"
          >
            {item.kind === "fixed"
              ? t("minPaid", { amount: formatAmount(limits.min) })
              : t("minSpent", { amount: formatAmount(limits.min) })}
          </p>
        )}
        <Keypad entry={entry} />
        <Button
          size="lg"
          disabled={!valid}
          onClick={() => {
            if (amount !== null && valid) onDone(amount);
          }}
        >
          {t("ok")}
        </Button>
        {!adding && limits.removable && (
          <Button variant="ghost" className="text-destructive" onClick={onRemove}>
            {t("remove")}
          </Button>
        )}
        {!adding && closeAt && (
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              onClick={() => {
                onDone(limits.min);
              }}
            >
              {t("closeAt", { amount: formatAmount(limits.min) })}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("closeHint")}</p>
          </div>
        )}
        {!adding && !limits.removable && item.kind === "fixed" && (
          <p className="text-xs text-muted-foreground">{t("hasPayments")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
