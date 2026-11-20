// Estimate maths and shapes, shared by the builder in the browser and the server that
// saves a quote. The server never trusts numbers from the browser: it cleans the estimate
// and works the total out again with the same functions.

export const LINE_TYPES = ["labor", "materials", "equipment", "subcontractor", "other"] as const;
export type LineType = (typeof LINE_TYPES)[number];
export const LINE_TYPE_LABELS: Record<LineType, string> = {
  labor: "Labor",
  materials: "Materials",
  equipment: "Equipment",
  subcontractor: "Subcontractor",
  other: "Other",
};

export type EstimateLine = {
  id: string;
  description: string;
  type: LineType;
  qty: number;
  unit: string;
  /** What it costs the pro, per unit, in cents. Never shown to the customer. */
  unitCostCents: number;
  /** Added on top of cost to get the price. Never shown to the customer. */
  markupPct: number;
};

export type EstimateSection = {
  id: string;
  name: string;
  /** False folds this section into "Other work" on the customer's copy. */
  show: boolean;
  lines: EstimateLine[];
};

/** How much of the estimate the customer sees. The total and milestones are always sent. */
export const VISIBILITIES = ["total", "sections", "items", "items_priced"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const VISIBILITY_LABELS: Record<Visibility, [string, string]> = {
  total: ["Total only", "The customer sees the price and the payment milestones, nothing else."],
  sections: ["Section totals", "Each section with its price, without the lines inside it."],
  items: ["Line items, section prices", "Every line with its quantity, and a price per section."],
  items_priced: ["Line items with prices", "Every line with its quantity and its price."],
};

export type Estimate = {
  sections: EstimateSection[];
  contingencyPct: number;
  /** Sales tax, charged on the price of materials lines only. */
  taxPct: number;
  discountCents: number;
  visibility: Visibility;
  inclusions: string;
  exclusions: string;
  /** How many days the quote is good for. Null means no expiry is stated. */
  validDays: number | null;
};

export type TemplateMilestone = { title: string; pct: number; amountCents: number };
/** What a saved template holds: the estimate and the rest of the quote form. */
export type TemplateData = {
  estimate: Estimate;
  scope: string;
  timeline: string;
  milestones: TemplateMilestone[];
};

export const emptyEstimate = (): Estimate => ({
  sections: [],
  contingencyPct: 0,
  taxPct: 0,
  discountCents: 0,
  visibility: "sections",
  inclusions: "",
  exclusions: "",
  validDays: 30,
});

export const lineCost = (l: EstimateLine) => Math.round(l.qty * l.unitCostCents);
export const linePrice = (l: EstimateLine) => Math.round(lineCost(l) * (1 + l.markupPct / 100));

/** True when the estimate has at least one priced line, so it sets the quote total. */
export const isItemized = (e: Estimate) => e.sections.some((s) => s.lines.some((l) => linePrice(l) > 0));

export function totals(e: Estimate) {
  let cost = 0;
  let subtotal = 0;
  let materials = 0;
  const sections = e.sections.map((s) => {
    const price = s.lines.reduce((sum, l) => sum + linePrice(l), 0);
    cost += s.lines.reduce((sum, l) => sum + lineCost(l), 0);
    materials += s.lines.filter((l) => l.type === "materials").reduce((sum, l) => sum + linePrice(l), 0);
    subtotal += price;
    return { id: s.id, price };
  });
  const contingency = Math.round((subtotal * e.contingencyPct) / 100);
  const tax = Math.round((materials * e.taxPct) / 100);
  const discount = Math.min(e.discountCents, subtotal + contingency + tax);
  const total = subtotal + contingency + tax - discount;
  // What is left after the pro's own costs and the tax they pass on. Platform and card fees come off later.
  const profit = total - tax - cost;
  return { sections, cost, subtotal, markup: subtotal - cost, contingency, tax, discount, total, profit };
}

// ---------------------------------------------------------------------------
// The customer's copy
// ---------------------------------------------------------------------------
export type BreakdownLine = { description: string; qty: number; unit: string; priceCents?: number };
export type BreakdownSection = { name: string; priceCents: number; lines?: BreakdownLine[] };
export type Breakdown = {
  visibility: Visibility;
  sections: BreakdownSection[];
  adjustments: { label: string; cents: number }[];
  inclusions: string;
  exclusions: string;
  /** ISO date the quote is good until, if the pro set one. */
  validUntil: string | null;
};

/** Builds what the customer is shown. Costs and markup never leave this function. */
export function customerBreakdown(e: Estimate, now = new Date()): Breakdown {
  const t = totals(e);
  const sections: BreakdownSection[] = [];
  const adjustments: { label: string; cents: number }[] = [];
  if (e.visibility !== "total" && isItemized(e)) {
    let hidden = 0;
    e.sections.forEach((s, i) => {
      const price = t.sections[i].price;
      if (!price) return;
      if (!s.show) {
        hidden += price;
        return;
      }
      const section: BreakdownSection = { name: s.name || `Section ${i + 1}`, priceCents: price };
      if (e.visibility === "items" || e.visibility === "items_priced") {
        section.lines = s.lines
          .filter((l) => l.description || linePrice(l) > 0)
          .map((l) => ({
            description: l.description || LINE_TYPE_LABELS[l.type],
            qty: l.qty,
            unit: l.unit,
            ...(e.visibility === "items_priced" ? { priceCents: linePrice(l) } : {}),
          }));
      }
      sections.push(section);
    });
    if (hidden) sections.push({ name: "Other work", priceCents: hidden });
    if (t.contingency) adjustments.push({ label: `Contingency (${e.contingencyPct}%)`, cents: t.contingency });
    if (t.tax) adjustments.push({ label: `Sales tax on materials (${e.taxPct}%)`, cents: t.tax });
    if (t.discount) adjustments.push({ label: "Discount", cents: -t.discount });
  }
  const validUntil = e.validDays
    ? new Date(now.getTime() + e.validDays * 86400000).toISOString().slice(0, 10)
    : null;
  return {
    visibility: e.visibility,
    sections,
    adjustments,
    inclusions: e.inclusions,
    exclusions: e.exclusions,
    validUntil,
  };
}

// ---------------------------------------------------------------------------
// Cleaning data that came from a browser or from storage
// ---------------------------------------------------------------------------
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const id = (v: unknown) => str(v, 40) || Math.random().toString(36).slice(2, 10);

export function cleanEstimate(raw: unknown): Estimate {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sections = (Array.isArray(r.sections) ? r.sections : []).slice(0, 30).map((s: unknown) => {
    const sec = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return {
      id: id(sec.id),
      name: str(sec.name, 80),
      show: sec.show !== false,
      lines: (Array.isArray(sec.lines) ? sec.lines : []).slice(0, 100).map((l: unknown) => {
        const line = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
        return {
          id: id(line.id),
          description: str(line.description, 200),
          type: (LINE_TYPES as readonly string[]).includes(String(line.type)) ? (line.type as LineType) : "other",
          qty: Math.round(num(line.qty, 0, 1_000_000) * 100) / 100,
          unit: str(line.unit, 16),
          unitCostCents: Math.round(num(line.unitCostCents, 0, 1_000_000_00)),
          markupPct: Math.round(num(line.markupPct, 0, 500) * 100) / 100,
        };
      }),
    };
  });
  const days = num(r.validDays, 0, 365);
  return {
    sections,
    contingencyPct: Math.round(num(r.contingencyPct, 0, 50) * 100) / 100,
    taxPct: Math.round(num(r.taxPct, 0, 20) * 1000) / 1000,
    discountCents: Math.round(num(r.discountCents, 0, 1_000_000_00)),
    visibility: (VISIBILITIES as readonly string[]).includes(String(r.visibility))
      ? (r.visibility as Visibility)
      : "sections",
    inclusions: str(r.inclusions, 2000),
    exclusions: str(r.exclusions, 2000),
    validDays: days ? Math.round(days) : null,
  };
}

export function cleanTemplate(raw: unknown): TemplateData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    estimate: cleanEstimate(r.estimate),
    scope: str(r.scope, 5000),
    timeline: str(r.timeline, 200),
    milestones: (Array.isArray(r.milestones) ? r.milestones : []).slice(0, 20).map((m: unknown) => {
      const row = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      return {
        title: str(row.title, 120),
        pct: Math.round(num(row.pct, 0, 100) * 100) / 100,
        amountCents: Math.round(num(row.amountCents, 0, 1_000_000_000)),
      };
    }),
  };
}

export function parseJson(value: unknown): unknown {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
}
