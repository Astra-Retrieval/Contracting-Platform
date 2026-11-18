"use client";

import { useRef, useState } from "react";
import { buttonCls, cn, inputCls } from "@/components/ui";

type Row = { key: number; title: string; amount: string };

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

/**
 * Payment schedule for a quote. Posts `milestone_title` and `milestone_amount` fields;
 * the quote total is the sum of the milestone amounts.
 */
export function MilestoneEditor({
  feeBps,
  processingBps,
  processingFixedCents,
}: {
  feeBps: number;
  processingBps: number;
  processingFixedCents: number;
}) {
  const [rows, setRows] = useState<Row[]>([{ key: 1, title: "Completion", amount: "" }]);
  // Row ids come from a counter that updates immediately, so two quick clicks never share one.
  const keyCounter = useRef(2);
  const newKey = () => keyCounter.current++;

  const total = rows.reduce((sum, r) => sum + (parseFloat(r.amount.replace(/[^0-9.]/g, "")) || 0), 0);
  const fee = (total * feeBps) / 10000;
  // Stripe charges per payment, so the fixed part applies once per milestone.
  const paidRows = rows.filter((r) => parseFloat(r.amount.replace(/[^0-9.]/g, "")) > 0).length;
  const processing = total ? (total * processingBps) / 10000 + (processingFixedCents / 100) * paidRows : 0;
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function applyPreset(name: string) {
    if (!total) return;
    const parts = presets[name];
    setRows(parts.map(([title, pct]) => ({ key: newKey(), title, amount: ((total * pct) / 100).toFixed(2) })));
  }

  return (
    <div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-2">
            <input
              name="milestone_title"
              aria-label={`Milestone ${i + 1} name`}
              required
              value={row.title}
              onChange={(e) => update(row.key, { title: e.target.value })}
              placeholder="Milestone name"
              className={inputCls}
            />
            <div className="relative w-40 shrink-0">
              <span className="pointer-events-none absolute top-2 left-3 text-sm text-stone-500">$</span>
              <input
                name="milestone_amount"
                aria-label={`Milestone ${i + 1} amount`}
                required
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => update(row.key, { amount: e.target.value })}
                placeholder="0.00"
                className={cn(inputCls, "pl-6 tabular-nums")}
              />
            </div>
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonCls("secondary", true)}
          onClick={() => {
            const key = newKey();
            setRows((list) => [...list, { key, title: "", amount: "" }]);
          }}
        >
          + Add milestone
        </button>
        <span className="text-xs text-stone-500">Split the total as:</span>
        {Object.keys(presets).map((name) => (
          <button
            key={name}
            type="button"
            disabled={!total}
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
  );
}
