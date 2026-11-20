// Licenses, insurance, bonds, and certifications: what exists, which trades need which,
// and how to work out where a pro stands. The rules below are for South Carolina
// residential work, checked against the S.C. Code and LLR on 2026-11-19. Sources, and the
// points still to confirm with LLR, are in the README under "Licenses and insurance".
//
// When a state changes a rule, or a new state opens, this is the file to edit.

export type CredentialKind = "license" | "insurance" | "bond" | "certification";

export type CredentialType = {
  id: string;
  label: string;
  kind: CredentialKind;
  issuer: string;
  /** Where anyone can check it. */
  lookupUrl?: string;
  lookupHint?: string;
  /** Shown to the pro when uploading. */
  help: string;
  hasCoverage?: boolean;
  /** Days before expiry that the pro is reminded. */
  remindDays?: number;
};

// South Carolina LLR public lookups. They sit behind a "not a robot" check, so they are
// used by people, not by this app.
const RBC_LOOKUP = "https://verify.llronline.com/LicLookup/Resbu/Resbu.aspx?div=46";
const CLB_LOOKUP = "https://verify.llronline.com/LicLookup/Contractors/Contractor.aspx?div=69";
const ARCH_LOOKUP = "https://verify.llronline.com/LicLookup/Arch/Arch.aspx?div=63";
const RBC_HINT =
  "Search the Residential Builders Commission by name or license number (numbers only). The status should say Active.";
const CLB_HINT =
  "Search the Contractor's Licensing Board by name or license number. The status should say Active and the classification should match the work.";

export const CREDENTIAL_TYPES: CredentialType[] = [
  {
    id: "sc_res_builder",
    label: "SC Residential Builder license",
    kind: "license",
    issuer: "SC Residential Builders Commission (LLR)",
    lookupUrl: RBC_LOOKUP,
    lookupHint: RBC_HINT,
    help: "Required for home building, repair, or remodeling when a job costs more than $5,000. The state holds a $15,000 bond for every licensed builder. Expires June 30 of even-numbered years. Upload your license or pocket card.",
  },
  {
    id: "sc_res_specialty",
    label: "SC Residential Specialty Contractor registration",
    kind: "license",
    issuer: "SC Residential Builders Commission (LLR)",
    lookupUrl: RBC_LOOKUP,
    lookupHint: RBC_HINT,
    help: "A registration for up to three of these trades on jobs over $500: roofers, painters and wallpaperers, drywall, floor covering, masons, carpenters, vinyl and aluminum siding, insulation, stucco, solar panels. Enter your classifications. Expires June 30 of odd-numbered years. For any one job over $5,000 the state also requires a $5,000 bond.",
  },
  {
    id: "sc_res_electrical",
    label: "SC Residential Electrician license",
    kind: "license",
    issuer: "SC Residential Builders Commission (LLR)",
    lookupUrl: RBC_LOOKUP,
    lookupHint: RBC_HINT,
    help: "Required for electrical work in homes on jobs over $500. Expires June 30 of odd-numbered years. For any one job over $5,000 the state also requires a $10,000 bond.",
  },
  {
    id: "sc_res_plumbing",
    label: "SC Residential Plumber license",
    kind: "license",
    issuer: "SC Residential Builders Commission (LLR)",
    lookupUrl: RBC_LOOKUP,
    lookupHint: RBC_HINT,
    help: "Required for plumbing work in homes on jobs over $500. Expires June 30 of odd-numbered years. For any one job over $5,000 the state also requires a $10,000 bond.",
  },
  {
    id: "sc_res_hvac",
    label: "SC Residential HVAC Installer and Repairer license",
    kind: "license",
    issuer: "SC Residential Builders Commission (LLR)",
    lookupUrl: RBC_LOOKUP,
    lookupHint: RBC_HINT,
    help: "The Residential HVAC Installer and Repairer license, required for heating and air work in homes on jobs over $500 (units up to 5 tons or 175,000 BTU). Expires June 30 of odd-numbered years. For any one job over $5,000 the state also requires a $10,000 bond.",
  },
  {
    id: "sc_clb_general",
    label: "SC General Contractor license",
    kind: "license",
    issuer: "SC Contractor's Licensing Board (LLR)",
    lookupUrl: CLB_LOOKUP,
    lookupHint: CLB_HINT,
    help: "The Contractor's Licensing Board general license, for jobs over $10,000. It also covers residential work in its classification. Enter your classification and group. Expires October 31 of even-numbered years.",
  },
  {
    id: "sc_clb_mechanical",
    label: "SC Mechanical Contractor license",
    kind: "license",
    issuer: "SC Contractor's Licensing Board (LLR)",
    lookupUrl: CLB_LOOKUP,
    lookupHint: CLB_HINT,
    help: "The Contractor's Licensing Board license for electrical, plumbing, heating, air conditioning, and refrigeration. It also covers residential work in its classification. Enter your classification (for example Electrical) and group. Expires October 31 of odd-numbered years.",
  },
  {
    id: "sc_architect",
    label: "SC Architect license",
    kind: "license",
    issuer: "SC Board of Architectural Examiners (LLR)",
    lookupUrl: ARCH_LOOKUP,
    lookupHint: "Search the Board of Architectural Examiners by name or license number.",
    help: "Needed to call yourself an architect. South Carolina does not require an architect for plans of one- and two-family houses and townhouses that follow the standard residential code. Renews every year.",
  },
  {
    id: "general_liability",
    label: "General liability insurance",
    kind: "insurance",
    issuer: "Your insurance company",
    lookupHint: "Call the agent named on the certificate and ask them to confirm the policy is active.",
    help: "South Carolina does not require general liability insurance for a contractor license, but customers look for it. Upload your certificate of insurance (ACORD 25) and enter the per-occurrence limit.",
    hasCoverage: true,
  },
  {
    id: "workers_comp",
    label: "Workers' compensation insurance",
    kind: "insurance",
    issuer: "Your insurance company",
    lookupUrl: "https://www.ewccv.com/cvs/",
    lookupHint: "Search the SC Workers' Compensation Commission coverage lookup by employer name and date. Businesses insured through the State Accident Fund may not appear; call (803) 737-6203.",
    help: "Required in South Carolina if you regularly have four or more employees, counting part-time workers and family. Upload your certificate.",
  },
  {
    id: "surety_bond",
    label: "Surety bond",
    kind: "bond",
    issuer: "Your bonding company",
    lookupHint: "Call the bonding company named on the bond and ask them to confirm it is active.",
    help: "South Carolina requires a bond for any one residential job over $5,000: $5,000 for specialty contractors and $10,000 for electricians, plumbers, and HVAC. Builders always carry $15,000. Upload the bond and enter its amount.",
    hasCoverage: true,
  },
  {
    id: "epa_rrp",
    label: "EPA Lead-Safe Certified Firm (RRP)",
    kind: "certification",
    issuer: "US Environmental Protection Agency",
    lookupUrl: "https://cdxocsppapps.epa.gov/ocspp-oppt-lead/firm-location-search",
    lookupHint: "Search EPA's list of lead-safe certified firms by name and state.",
    help: "A federal rule for any paid work that disturbs paint in homes built before 1978, including sole proprietors.",
  },
  {
    id: "epa_608",
    label: "EPA Section 608 technician certification",
    kind: "certification",
    issuer: "US Environmental Protection Agency",
    lookupHint: "Ask to see the technician's wallet card. EPA has no public lookup.",
    help: "A federal rule for anyone who opens a refrigerant circuit. The card does not expire, so leave the expiry date empty.",
  },
  {
    id: "sc_pesticide",
    label: "SC Commercial Pesticide Applicator license",
    kind: "license",
    issuer: "Clemson University Department of Pesticide Regulation",
    lookupUrl: "https://regfocus.clemson.edu/dpr/commercial.htm",
    lookupHint: "Search Clemson's list of commercial pesticide applicators by name.",
    help: "Required to apply any pesticide or weed killer for pay on lawns and ornamentals (Category 3). Expires December 31 every year. The state requires $50,000 of liability insurance for this license.",
  },
  {
    id: "business_license",
    label: "City or county business license",
    kind: "license",
    issuer: "Your city or county",
    lookupHint: "Call the city or county business license office.",
    help: "Most South Carolina cities and some counties require one to work inside their limits.",
  },
];

export const credentialType = (id: string) => CREDENTIAL_TYPES.find((t) => t.id === id);

/** A legal requirement that any one of several documents satisfies. */
export type Requirement = {
  id: string;
  label: string;
  /** Any one of these credential types meets the requirement. */
  anyOf: string[];
  /** Plain-language rule, shown to pros and customers. */
  rule: string;
};

export const REQUIREMENTS: Requirement[] = [
  {
    id: "builder",
    label: "Residential Builder license",
    anyOf: ["sc_res_builder", "sc_clb_general"],
    rule: "South Carolina requires a Residential Builder license for home building, repair, or remodeling jobs that cost more than $5,000 (S.C. Code 40-59-20). A Contractor's Licensing Board license in Building also counts.",
  },
  {
    id: "specialty",
    label: "Residential Specialty Contractor registration",
    anyOf: ["sc_res_specialty", "sc_res_builder", "sc_clb_general"],
    rule: "South Carolina requires a Residential Specialty Contractor registration for this trade on jobs over $500, and a $5,000 bond for any one job over $5,000 (S.C. Code 40-59-20 and 40-59-220). A Residential Builder license, or a Contractor's Licensing Board license in the matching classification, also counts.",
  },
  {
    id: "electrical",
    label: "Electrical license",
    anyOf: ["sc_res_electrical", "sc_clb_mechanical"],
    rule: "South Carolina requires a Residential Electrician license for electrical work in homes on jobs over $500, and a $10,000 bond for any one job over $5,000. A Mechanical Contractor license in Electrical also counts.",
  },
  {
    id: "plumbing",
    label: "Plumbing license",
    anyOf: ["sc_res_plumbing", "sc_clb_mechanical"],
    rule: "South Carolina requires a Residential Plumber license for plumbing work in homes on jobs over $500, and a $10,000 bond for any one job over $5,000. A Mechanical Contractor license in Plumbing also counts.",
  },
  {
    id: "hvac",
    label: "Heating and air license",
    anyOf: ["sc_res_hvac", "sc_clb_mechanical"],
    rule: "South Carolina requires a Residential HVAC Installer and Repairer license for heating and air work in homes on jobs over $500, and a $10,000 bond for any one job over $5,000. A Mechanical Contractor license in Air Conditioning or Heating also counts.",
  },
];

export const requirement = (id: string) => REQUIREMENTS.find((r) => r.id === id);

/**
 * What each trade (by category slug) needs. `required` lists requirement ids; a trade with
 * none has no state document. `recommended` lists credential types worth having.
 */
export const TRADE_RULES: Record<string, { required: string[]; recommended: string[]; note?: string }> = {
  "general-contractor": { required: ["builder"], recommended: ["general_liability", "workers_comp", "epa_rrp"] },
  handyman: {
    required: [],
    recommended: ["general_liability"],
    note: "South Carolina has no handyman license. Nothing is needed for jobs of $500 or less. Above $500, painting, drywall, flooring, roofing, masonry, and carpentry need a specialty registration, and electrical, plumbing, and heating and air need the trade license. General repair above $5,000 needs a Residential Builder license.",
  },
  carpentry: { required: ["specialty"], recommended: ["general_liability"] },
  cabinetry: {
    required: [],
    recommended: ["general_liability", "sc_res_specialty"],
    note: "The state does not name cabinetry as its own classification. It may fall under Carpenters on jobs over $500; a job over $5,000 that is part of a remodel needs a Residential Builder license.",
  },
  plumbing: { required: ["plumbing"], recommended: ["general_liability", "surety_bond"] },
  electrical: { required: ["electrical"], recommended: ["general_liability", "surety_bond"] },
  hvac: { required: ["hvac"], recommended: ["general_liability", "surety_bond", "epa_608"] },
  painting: { required: ["specialty"], recommended: ["general_liability", "epa_rrp"] },
  drywall: { required: ["specialty"], recommended: ["general_liability", "epa_rrp"] },
  flooring: {
    required: ["specialty"],
    recommended: ["general_liability"],
    note: "The state's Floor Covering classification names carpet, vinyl, rubber, linoleum, and asphalt. Hardwood is not named.",
  },
  tile: {
    required: [],
    recommended: ["general_liability", "sc_res_specialty"],
    note: "The state does not name tile as its own classification. It may fall under Floor Covering or Masons on jobs over $500; a job over $5,000 needs a Residential Builder license.",
  },
  roofing: { required: ["specialty"], recommended: ["general_liability", "workers_comp", "surety_bond"] },
  "kitchen-remodel": { required: ["builder"], recommended: ["general_liability", "epa_rrp"] },
  "bathroom-remodel": { required: ["builder"], recommended: ["general_liability", "epa_rrp"] },
  masonry: { required: ["specialty"], recommended: ["general_liability", "surety_bond"] },
  landscaping: {
    required: [],
    recommended: ["general_liability", "sc_pesticide"],
    note: "South Carolina has no contractor license for planting and lawn care. Applying any pesticide or weed killer for pay needs a Clemson pesticide applicator license. Retaining walls and paving may count as masonry.",
  },
  "decks-fences": {
    required: [],
    recommended: ["general_liability", "sc_res_specialty"],
    note: "The state does not name decks or fences as their own classification. They may fall under Carpenters on jobs over $500; a job over $5,000 needs a Residential Builder license.",
  },
  "windows-doors": {
    required: [],
    recommended: ["general_liability", "epa_rrp", "sc_res_specialty"],
    note: "The state does not name windows and doors as their own classification. They may fall under Carpenters on jobs over $500. Replacing windows in a home built before 1978 needs EPA lead-safe certification.",
  },
  demolition: {
    required: [],
    recommended: ["general_liability"],
    note: "No state contractor license for hauling. Demolition that is part of a remodel over $5,000 needs a Residential Builder license. Removing asbestos for pay needs a state asbestos license.",
  },
  design: {
    required: [],
    recommended: ["sc_architect"],
    note: "South Carolina does not require an architect for plans of one- and two-family houses and townhouses that follow the standard residential code. Only a licensed architect may use the title architect.",
  },
};

export const tradeNeedsDocs = (slug: string) => (TRADE_RULES[slug]?.required.length ?? 0) > 0;

// ---------------------------------------------------------------------------
// Where a pro stands
// ---------------------------------------------------------------------------
export type Credential = {
  id: string;
  pro_id: string;
  type: string;
  number: string;
  holder_name: string;
  classification: string;
  coverage_cents: number | null;
  expires_on: string | null;
  status: "pending" | "verified" | "rejected" | "expired";
  reviewed_at: string | null;
  created_at: string;
};
/** The columns customers may read. Use this in every select on pro_credentials. */
export const CREDENTIAL_COLUMNS =
  "id, pro_id, type, number, holder_name, classification, coverage_cents, expires_on, status, reviewed_at, created_at";

export type DocsStatus = "none_required" | "missing" | "provided" | "verified";
export type RequirementState = Requirement & {
  state: "verified" | "provided" | "missing";
  /** Trade names that bring this requirement in. */
  trades: string[];
};

const today = () => new Date().toISOString().slice(0, 10);
/** The date `days` from now, as YYYY-MM-DD. */
export const dateInDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
/** True while a document counts: uploaded, not rejected, not past its expiry date. */
export const isCurrent = (c: Credential, day = today()) =>
  (c.status === "pending" || c.status === "verified") && (!c.expires_on || c.expires_on >= day);

/** Newest current document of each type. */
export function currentByType(credentials: Credential[], day = today()) {
  const map = new Map<string, Credential>();
  for (const c of [...credentials].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!isCurrent(c, day)) continue;
    const existing = map.get(c.type);
    // A staff-checked document outranks a newer unchecked one of the same type.
    if (existing?.status === "verified" && c.status !== "verified") continue;
    map.set(c.type, c);
  }
  return map;
}

/** Works out each requirement for a pro's trades and the overall summary. */
export function evaluate(trades: { slug: string; name: string }[], credentials: Credential[], day = today()) {
  const current = currentByType(credentials, day);
  const byRequirement = new Map<string, string[]>();
  for (const t of trades) {
    for (const id of TRADE_RULES[t.slug]?.required ?? []) {
      byRequirement.set(id, [...(byRequirement.get(id) ?? []), t.name]);
    }
  }
  const requirements: RequirementState[] = [];
  for (const [id, names] of byRequirement) {
    const req = requirement(id);
    if (!req) continue;
    const held = req.anyOf.map((type) => current.get(type)).filter(Boolean) as Credential[];
    const state = held.some((c) => c.status === "verified") ? "verified" : held.length ? "provided" : "missing";
    requirements.push({ ...req, state, trades: names });
  }
  const status: DocsStatus = !requirements.length
    ? "none_required"
    : requirements.some((r) => r.state === "missing")
      ? "missing"
      : requirements.every((r) => r.state === "verified")
        ? "verified"
        : "provided";
  return { requirements, status, current };
}

export const DOCS_STATUS_LABEL: Record<DocsStatus, string> = {
  none_required: "No state license needed for their trades",
  missing: "No proof of license provided",
  provided: "Documents provided, not yet checked",
  verified: "License checked by Crew Orchard",
};
