"use client";

import { useState } from "react";
import { QuoteBreakdown } from "@/components/quote-breakdown";
import { Field, buttonCls, cn, inputCls } from "@/components/ui";
import {
  LINE_TYPES,
  LINE_TYPE_LABELS,
  VISIBILITIES,
  VISIBILITY_LABELS,
  customerBreakdown,
  emptyEstimate,
  linePrice,
  totals,
  type Estimate,
  type EstimateLine,
  type EstimateSection,
  type LineType,
  type TemplateData,
  type Visibility,
} from "@/lib/estimate";

type Milestone = { key: string; title: string; amount: string; pct: string };
export type SavedTemplate = { id: string; name: string; data: TemplateData };

const presets: Record<string, [string, number][]> = {
  "Single payment": [["Completion", 100]],
  "Deposit + final": [
    ["Deposit", 30],
    ["Completion", 70],
  ],
  "Three stages": [
    ["Deposit", 20],
    ["Midpoint", 40],
    ["Completion", 40],
  ],
};

const uid = () => Math.random().toString(36).slice(2, 10);
const dollars = (s: string) => parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const blankLine = (markupPct = 0): EstimateLine => ({
  id: uid(),
  description: "",
  type: "labor",
  qty: 1,
  unit: "",
  unitCostCents: 0,
  markupPct,
});
const blankSection = (name: string, markupPct = 0): EstimateSection => ({
  id: uid(),
  name,
  show: true,
  lines: [blankLine(markupPct)],
});
/** Fresh ids, so applying a template twice never reuses a row's identity. */
const reId = (e: Estimate): Estimate => ({
  ...e,
  sections: e.sections.map((s) => ({ ...s, id: uid(), lines: s.lines.map((l) => ({ ...l, id: uid() })) })),
});
const cellCls =
  "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none";

/**
 * The quote form's working parts: scope, an optional itemized estimate, what the customer
 * gets to see of it, and the payment milestones. Posts `scope`, `timeline`, `estimate`
 * (JSON), `itemized`, and `milestone_title` / `milestone_amount` fields.
 */
export function QuoteBuilder({
  feeBps,
  processingBps,
  processingFixedCents,
  templates = [],
  initial,
  mode = "quote",
}: {
  feeBps: number;
  processingBps: number;
  processingFixedCents: number;
  templates?: SavedTemplate[];
  initial?: TemplateData;
  mode?: "quote" | "template";
}) {
  const newKey = uid;
  const toRows = (data?: TemplateData): Milestone[] =>
    data?.milestones.length
      ? data.milestones.map((m) => ({
          key: newKey(),
          title: m.title,
          amount: m.amountCents ? (m.amountCents / 100).toFixed(2) : "",
          pct: String(m.pct || ""),
        }))
      : [{ key: newKey(), title: "Completion", amount: "", pct: "100" }];
  const hasLines = (e: Estimate) => e.sections.some((s) => s.lines.length > 0);

  const [estimate, setEstimate] = useState<Estimate>(() => (initial ? reId(initial.estimate) : emptyEstimate()));
  const [itemized, setItemized] = useState(() => Boolean(initial && hasLines(initial.estimate)));
  const [scope, setScope] = useState(initial?.scope ?? "");
  const [timeline, setTimeline] = useState(initial?.timeline ?? "");
  const [rows, setRows] = useState<Milestone[]>(() => toRows(initial));
  const [defaultMarkup, setDefaultMarkup] = useState("20");
  const [templateId, setTemplateId] = useState("");
  const [saveName, setSaveName] = useState("");
  // Bumped when values change underneath the inputs, so they pick up the new numbers.
  const [rev, setRev] = useState(0);

  const t = totals(estimate);
  const simpleTotal = Math.round(rows.reduce((sum, r) => sum + dollars(r.amount), 0) * 100);
  const total = itemized ? t.total : simpleTotal;

  // In an itemized quote the milestones are shares of the estimate total. The last one
  // takes up any rounding so they always add up exactly.
  const pctSum = rows.reduce((sum, r) => sum + (parseFloat(r.pct) || 0), 0);
  const pctOk = Math.abs(pctSum - 100) < 0.005;
  const amounts = rows.map((r) => Math.round((t.total * (parseFloat(r.pct) || 0)) / 100));
  if (itemized && pctOk && amounts.length) {
    amounts[amounts.length - 1] += t.total - amounts.reduce((a, b) => a + b, 0);
  }
  const amountFor = (i: number) => (itemized ? amounts[i] : Math.round(dollars(rows[i].amount) * 100));

  const fee = Math.round((total * feeBps) / 10000);
  const paidRows = rows.filter((_, i) => amountFor(i) > 0).length;
  const processing = total ? Math.round((total * processingBps) / 10000) + processingFixedCents * paidRows : 0;

  const patch = (p: Partial<Estimate>) => setEstimate((e) => ({ ...e, ...p }));
  const patchSection = (id: string, p: Partial<EstimateSection>) =>
    setEstimate((e) => ({ ...e, sections: e.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const patchLine = (sid: string, lid: string, p: Partial<EstimateLine>) =>
    setEstimate((e) => ({
      ...e,
      sections: e.sections.map((s) =>
        s.id === sid ? { ...s, lines: s.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) } : s,
      ),
    }));
  const patchRow = (key: string, p: Partial<Milestone>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function switchMode(next: boolean) {
    if (next === itemized) return;
    if (next) {
      // Keep the same split when moving from typed amounts to shares of the total.
      const sum = rows.reduce((s, r) => s + dollars(r.amount), 0);
      setRows((list) =>
        list.map((r) => ({ ...r, pct: sum ? ((dollars(r.amount) / sum) * 100).toFixed(2).replace(/\.?0+$/, "") : String(100 / list.length) })),
      );
      if (!hasLines(estimate)) patch({ sections: [blankSection("Section 1", parseFloat(defaultMarkup) || 0)] });
    } else {
      setRows((list) => list.map((r, i) => ({ ...r, amount: amounts[i] ? (amounts[i] / 100).toFixed(2) : "" })));
    }
    setItemized(next);
  }

  function applyPreset(name: string) {
    const parts = presets[name];
    setRows(
      parts.map(([title, pct]) => ({
        key: newKey(),
        title,
        pct: String(pct),
        amount: total ? ((total * pct) / 10000).toFixed(2) : "",
      })),
    );
  }

  function applyTemplate() {
    const template = templates.find((x) => x.id === templateId);
    if (!template) return;
    const dirty = scope || hasLines(estimate) || rows.some((r) => r.amount);
    if (dirty && !window.confirm(`Replace what you have entered with the "${template.name}" template?`)) return;
    setEstimate(reId(template.data.estimate));
    setItemized(hasLines(template.data.estimate));
    setScope(template.data.scope);
    setTimeline(template.data.timeline);
    setRows(toRows(template.data));
    setRev((n) => n + 1);
  }

  function applyMarkupToAll() {
    const pct = Math.max(0, parseFloat(defaultMarkup) || 0);
    setEstimate((e) => ({
      ...e,
      sections: e.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, markupPct: pct })) })),
    }));
    setRev((n) => n + 1);
  }

  const preview = customerBreakdown(estimate);

  return (
    <div className="space-y-6">
      <input type="hidden" name="estimate" value={JSON.stringify(estimate)} />
      <input type="hidden" name="itemized" value={itemized ? "true" : "false"} />

      {templates.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-brand-50 p-3">
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-sm font-medium text-stone-800">Start from a template</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
              <option value="">Choose a template</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!templateId} onClick={applyTemplate} className={buttonCls("secondary")}>
            Use template
          </button>
        </div>
      )}

      <Field label="Scope of work" hint="What is included, what is not, and any assumptions.">
        <textarea name="scope" rows={4} value={scope} onChange={(e) => setScope(e.target.value)} className={inputCls} />
      </Field>

      {/* ------------------------------------------------------------ Estimate */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-stone-800">Price</p>
          <div className="flex rounded-lg border border-stone-300 bg-white p-0.5 text-sm" role="group" aria-label="How to price this quote">
            {(
              [
                [false, "Simple price"],
                [true, "Itemized estimate"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={itemized === value}
                onClick={() => switchMode(value)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium",
                  itemized === value ? "bg-brand-200 text-brand-950" : "text-stone-600 hover:bg-stone-100",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!itemized ? (
          <p className="text-sm text-stone-600">
            The quote total is the sum of the payment milestones below. Switch to an itemized
            estimate to build the price from labor, materials, and markup.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-stone-600">
              Your costs and markup are private. Further down you choose how much of this the
              customer sees.
            </p>
            {estimate.sections.map((s, si) => (
              <div key={s.id} className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Section ${si + 1} name`}
                    value={s.name}
                    onChange={(e) => patchSection(s.id, { name: e.target.value })}
                    placeholder="Section name, e.g. Demolition"
                    className={cn(cellCls, "max-w-xs font-semibold")}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-stone-600">
                    <input
                      type="checkbox"
                      checked={s.show}
                      onChange={(e) => patchSection(s.id, { show: e.target.checked })}
                      className="size-4 accent-brand-600"
                    />
                    Show to customer
                  </label>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{usd(t.sections[si]?.price ?? 0)}</span>
                  <button
                    type="button"
                    aria-label={`Remove section ${si + 1}`}
                    onClick={() => patch({ sections: estimate.sections.filter((x) => x.id !== s.id) })}
                    className={buttonCls("ghost", true)}
                  >
                    Remove section
                  </button>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[46rem] border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
                    <thead className="text-left text-xs text-stone-500">
                      <tr>
                        <th className="font-medium">Item</th>
                        <th className="w-32 font-medium">Type</th>
                        <th className="w-20 font-medium">Qty</th>
                        <th className="w-20 font-medium">Unit</th>
                        <th className="w-28 font-medium">Your cost each</th>
                        <th className="w-20 font-medium">Markup %</th>
                        <th className="w-28 text-right font-medium">Price</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {s.lines.map((l, li) => (
                        <tr key={`${rev}-${l.id}`}>
                          <td>
                            <input
                              aria-label={`Item ${li + 1} description`}
                              defaultValue={l.description}
                              onChange={(e) => patchLine(s.id, l.id, { description: e.target.value })}
                              placeholder="e.g. Remove old decking"
                              className={cellCls}
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Item ${li + 1} type`}
                              value={l.type}
                              onChange={(e) => patchLine(s.id, l.id, { type: e.target.value as LineType })}
                              className={cellCls}
                            >
                              {LINE_TYPES.map((x) => (
                                <option key={x} value={x}>
                                  {LINE_TYPE_LABELS[x]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`Item ${li + 1} quantity`}
                              inputMode="decimal"
                              defaultValue={l.qty || ""}
                              onChange={(e) => patchLine(s.id, l.id, { qty: dollars(e.target.value) })}
                              className={cn(cellCls, "tabular-nums")}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Item ${li + 1} unit`}
                              defaultValue={l.unit}
                              onChange={(e) => patchLine(s.id, l.id, { unit: e.target.value })}
                              placeholder="hr, sq ft"
                              className={cellCls}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Item ${li + 1} cost each in dollars`}
                              inputMode="decimal"
                              defaultValue={l.unitCostCents ? (l.unitCostCents / 100).toFixed(2) : ""}
                              onChange={(e) =>
                                patchLine(s.id, l.id, { unitCostCents: Math.round(dollars(e.target.value) * 100) })
                              }
                              placeholder="0.00"
                              className={cn(cellCls, "tabular-nums")}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Item ${li + 1} markup percent`}
                              inputMode="decimal"
                              defaultValue={l.markupPct || ""}
                              onChange={(e) => patchLine(s.id, l.id, { markupPct: dollars(e.target.value) })}
                              placeholder="0"
                              className={cn(cellCls, "tabular-nums")}
                            />
                          </td>
                          <td className="text-right font-medium tabular-nums">{usd(linePrice(l))}</td>
                          <td>
                            <button
                              type="button"
                              aria-label={`Remove item ${li + 1}`}
                              onClick={() => patchSection(s.id, { lines: s.lines.filter((x) => x.id !== l.id) })}
                              className="rounded px-1.5 py-1 text-stone-500 hover:bg-stone-200 hover:text-stone-900"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    patchSection(s.id, { lines: [...s.lines, blankLine(parseFloat(defaultMarkup) || 0)] })
                  }
                  className={cn(buttonCls("secondary", true), "mt-2")}
                >
                  + Add line
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                patch({
                  sections: [
                    ...estimate.sections,
                    blankSection(`Section ${estimate.sections.length + 1}`, parseFloat(defaultMarkup) || 0),
                  ],
                })
              }
              className={buttonCls("secondary", true)}
            >
              + Add section
            </button>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3" key={`adj-${rev}`}>
                <label className="col-span-2">
                  <span className="mb-1 block text-xs font-medium text-stone-600">Markup for new lines (%)</span>
                  <span className="flex gap-2">
                    <input
                      inputMode="decimal"
                      value={defaultMarkup}
                      onChange={(e) => setDefaultMarkup(e.target.value)}
                      className={cn(cellCls, "max-w-24 tabular-nums")}
                    />
                    <button type="button" onClick={applyMarkupToAll} className={buttonCls("ghost", true)}>
                      Apply to every line
                    </button>
                  </span>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-stone-600">Contingency (%)</span>
                  <input
                    inputMode="decimal"
                    defaultValue={estimate.contingencyPct || ""}
                    onChange={(e) => patch({ contingencyPct: Math.min(50, dollars(e.target.value)) })}
                    placeholder="0"
                    className={cn(cellCls, "tabular-nums")}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-stone-600">Sales tax on materials (%)</span>
                  <input
                    inputMode="decimal"
                    defaultValue={estimate.taxPct || ""}
                    onChange={(e) => patch({ taxPct: Math.min(20, dollars(e.target.value)) })}
                    placeholder="0"
                    className={cn(cellCls, "tabular-nums")}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-stone-600">Discount ($)</span>
                  <input
                    inputMode="decimal"
                    defaultValue={estimate.discountCents ? (estimate.discountCents / 100).toFixed(2) : ""}
                    onChange={(e) => patch({ discountCents: Math.round(dollars(e.target.value) * 100) })}
                    placeholder="0.00"
                    className={cn(cellCls, "tabular-nums")}
                  />
                </label>
              </div>

              <dl className="grid grid-cols-2 gap-y-1 self-start rounded-lg bg-stone-50 p-3 text-sm">
                <dt className="text-stone-600">Your costs</dt>
                <dd className="text-right tabular-nums">{usd(t.cost)}</dd>
                <dt className="text-stone-600">Markup</dt>
                <dd className="text-right tabular-nums">{usd(t.markup)}</dd>
                {t.contingency > 0 && (
                  <>
                    <dt className="text-stone-600">Contingency</dt>
                    <dd className="text-right tabular-nums">{usd(t.contingency)}</dd>
                  </>
                )}
                {t.tax > 0 && (
                  <>
                    <dt className="text-stone-600">Sales tax</dt>
                    <dd className="text-right tabular-nums">{usd(t.tax)}</dd>
                  </>
                )}
                {t.discount > 0 && (
                  <>
                    <dt className="text-stone-600">Discount</dt>
                    <dd className="text-right tabular-nums">−{usd(t.discount)}</dd>
                  </>
                )}
                <dt className="border-t border-stone-200 pt-1 font-semibold text-stone-900">Quote total</dt>
                <dd className="border-t border-stone-200 pt-1 text-right font-semibold tabular-nums">{usd(t.total)}</dd>
                <dt className="text-stone-600">Profit before fees</dt>
                <dd className="text-right tabular-nums">
                  {usd(t.profit)}
                  {t.total > 0 && ` (${Math.round((t.profit / t.total) * 100)}%)`}
                </dd>
              </dl>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ Customer's copy */}
      <div>
        <p className="mb-2 text-sm font-medium text-stone-800">What the customer sees</p>
        <p className="mb-3 text-sm text-stone-600">
          The total and the payment milestones are always sent. Your costs and markup never are.
        </p>
        {itemized && (
          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="sr-only">Level of detail</legend>
              {VISIBILITIES.map((v) => (
                <label
                  key={v}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm",
                    estimate.visibility === v ? "border-brand-500 bg-brand-50" : "border-stone-200 bg-white",
                  )}
                >
                  <input
                    type="radio"
                    name="visibility_choice"
                    checked={estimate.visibility === v}
                    onChange={() => patch({ visibility: v as Visibility })}
                    className="mt-0.5 size-4 accent-brand-600"
                  />
                  <span>
                    <span className="font-medium text-stone-900">{VISIBILITY_LABELS[v][0]}</span>
                    <span className="block text-stone-600">{VISIBILITY_LABELS[v][1]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="rounded-lg border border-dashed border-stone-300 bg-white p-3">
              <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Preview of the customer&apos;s copy</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{usd(t.total)}</p>
              {preview.sections.length === 0 && (
                <p className="mt-1 text-sm text-stone-500">Only the total and the milestones.</p>
              )}
              <QuoteBreakdown breakdown={{ ...preview, inclusions: "", exclusions: "", validUntil: null }} />
            </div>
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2" key={`inc-${rev}`}>
          <label>
            <span className="mb-1 block text-sm font-medium text-stone-800">Included (optional)</span>
            <textarea
              rows={3}
              defaultValue={estimate.inclusions}
              onChange={(e) => patch({ inclusions: e.target.value })}
              placeholder="e.g. Permits, haul-away, one coat of sealer"
              className={inputCls}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-stone-800">Not included (optional)</span>
            <textarea
              rows={3}
              defaultValue={estimate.exclusions}
              onChange={(e) => patch({ exclusions: e.target.value })}
              placeholder="e.g. Electrical work, repairs to hidden damage"
              className={inputCls}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-stone-800">Price is good for (days)</span>
            <input
              inputMode="numeric"
              defaultValue={estimate.validDays ?? ""}
              onChange={(e) => patch({ validDays: Math.round(dollars(e.target.value)) || null })}
              placeholder="Leave empty for no expiry"
              className={cn(inputCls, "max-w-48")}
            />
          </label>
        </div>
      </div>

      {/* ------------------------------------------------------------ Milestones */}
      <div>
        <p className="mb-1 text-sm font-medium text-stone-800">Payment milestones</p>
        <p className="mb-2 text-xs text-stone-500">
          {itemized
            ? "Each milestone is a share of the quote total. You send the bill for each one when it comes due."
            : "The quote total is the sum of these amounts. You send the bill for each one when it comes due."}
        </p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                name="milestone_title"
                aria-label={`Milestone ${i + 1} name`}
                required
                value={row.title}
                onChange={(e) => patchRow(row.key, { title: e.target.value })}
                placeholder="Milestone name"
                className={inputCls}
              />
              {itemized ? (
                <>
                  <input type="hidden" name="milestone_amount" value={(amountFor(i) / 100).toFixed(2)} />
                  <input type="hidden" name="milestone_pct" value={parseFloat(row.pct) || 0} />
                  <div className="relative w-24 shrink-0">
                    <input
                      aria-label={`Milestone ${i + 1} share of the total, in percent`}
                      required
                      inputMode="decimal"
                      value={row.pct}
                      onChange={(e) => patchRow(row.key, { pct: e.target.value })}
                      className={cn(inputCls, "pr-7 tabular-nums")}
                    />
                    <span className="pointer-events-none absolute top-2 right-3 text-sm text-stone-500">%</span>
                  </div>
                  <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">{usd(amountFor(i))}</span>
                </>
              ) : (
                <div className="relative w-40 shrink-0">
                  <span className="pointer-events-none absolute top-2 left-3 text-sm text-stone-500">$</span>
                  <input
                    name="milestone_amount"
                    aria-label={`Milestone ${i + 1} amount`}
                    required={mode === "quote"}
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => patchRow(row.key, { amount: e.target.value })}
                    placeholder="0.00"
                    className={cn(inputCls, "pl-6 tabular-nums")}
                  />
                </div>
              )}
              <button
                type="button"
                aria-label={`Remove milestone ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                className={buttonCls("ghost", true)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {itemized && !pctOk && (
          <p className="mt-2 text-sm text-red-700">
            The milestone shares add up to {Math.round(pctSum * 100) / 100}%. They need to add up to 100%.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonCls("secondary", true)}
            onClick={() => {
              const key = newKey();
              setRows((list) => [...list, { key, title: "", amount: "", pct: "" }]);
            }}
          >
            + Add milestone
          </button>
          <span className="text-xs text-stone-500">Split the total as:</span>
          {Object.keys(presets).map((name) => (
            <button
              key={name}
              type="button"
              disabled={!itemized && !total}
              className={buttonCls("ghost", true)}
              onClick={() => applyPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <dl className="mt-4 grid max-w-sm grid-cols-2 gap-y-1 rounded-lg bg-stone-50 p-3 text-sm">
          <dt className="text-stone-600">Quote total</dt>
          <dd className="text-right font-semibold tabular-nums">{usd(total)}</dd>
          <dt className="text-stone-600">Platform fee ({feeBps / 100}%)</dt>
          <dd className="text-right tabular-nums">−{usd(fee)}</dd>
          <dt className="text-stone-600">Card processing (est.)</dt>
          <dd className="text-right tabular-nums">−{usd(processing)}</dd>
          <dt className="text-stone-600">You receive (est.)</dt>
          <dd className="text-right font-semibold tabular-nums">{usd(Math.max(0, total - fee - processing))}</dd>
        </dl>
      </div>

      <Field label="Timeline" hint="e.g. Start in 2 weeks, about 5 working days">
        <input
          name="timeline"
          maxLength={200}
          value={timeline}
          onChange={(e) => setTimeline(e.target.value)}
          className={inputCls}
        />
      </Field>

      {mode === "quote" && (
        <label className="block rounded-lg border border-stone-200 bg-stone-50 p-3">
          <span className="mb-1 block text-sm font-medium text-stone-800">Save this as a template (optional)</span>
          <input
            name="template_name"
            maxLength={80}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Template name, e.g. Standard deck rebuild"
            className={cn(inputCls, "max-w-md")}
          />
          <span className="mt-1 block text-xs text-stone-500">
            Saves the estimate, scope, timeline, and milestone split so you can start the next quote from it.
          </span>
        </label>
      )}
    </div>
  );
}
