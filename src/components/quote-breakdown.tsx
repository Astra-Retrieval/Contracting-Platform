import type { Breakdown } from "@/lib/estimate";
import { money, shortDate } from "@/lib/format";

const qty = (n: number, unit: string) => (n ? `${n.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}` : "");

/** The part of an estimate the pro chose to share: sections, lines, what is and is not included. */
export function QuoteBreakdown({ breakdown }: { breakdown: Breakdown | null | undefined }) {
  if (!breakdown) return null;
  const { sections, adjustments, inclusions, exclusions, validUntil } = breakdown;
  if (!sections.length && !inclusions && !exclusions && !validUntil) return null;

  return (
    <div className="mt-3 space-y-3 text-sm">
      {sections.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <table className="w-full text-left">
            <caption className="sr-only">What the price covers</caption>
            <tbody className="divide-y divide-stone-100">
              {sections.map((s, i) => (
                <SectionRows key={i} section={s} />
              ))}
              {adjustments.map((a) => (
                <tr key={a.label} className="bg-stone-50">
                  <td className="px-3 py-2 text-stone-700" colSpan={2}>
                    {a.label}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-900 tabular-nums">{money(a.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inclusions && (
        <div>
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Included</p>
          <p className="mt-0.5 whitespace-pre-wrap text-stone-700">{inclusions}</p>
        </div>
      )}
      {exclusions && (
        <div>
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Not included</p>
          <p className="mt-0.5 whitespace-pre-wrap text-stone-700">{exclusions}</p>
        </div>
      )}
      {validUntil && <p className="text-xs text-stone-500">This price is good until {shortDate(validUntil)}.</p>}
    </div>
  );
}

function SectionRows({ section }: { section: Breakdown["sections"][number] }) {
  return (
    <>
      <tr className="bg-stone-50">
        <th scope="row" colSpan={2} className="px-3 py-2 font-semibold text-stone-900">
          {section.name}
        </th>
        <td className="px-3 py-2 text-right font-semibold text-stone-900 tabular-nums">
          {money(section.priceCents)}
        </td>
      </tr>
      {(section.lines ?? []).map((l, i) => (
        <tr key={i}>
          <td className="py-1.5 pr-3 pl-6 text-stone-700">{l.description}</td>
          <td className="px-3 py-1.5 whitespace-nowrap text-stone-500 tabular-nums">{qty(l.qty, l.unit)}</td>
          <td className="px-3 py-1.5 text-right text-stone-700 tabular-nums">
            {l.priceCents != null ? money(l.priceCents) : ""}
          </td>
        </tr>
      ))}
    </>
  );
}
