/**
 * Deterministic extraction of hard constraints from requirement text.
 *
 * Eligibility is a gate, so what feeds it has to be provable rather than
 * guessed: every function here matches an explicit written pattern and returns
 * the phrase it matched, so a failed check can quote the clause that failed it.
 * When nothing matches, nothing is asserted — an absent constraint means the
 * dimension is not gated at all, never that it is gated on an assumption.
 */

export interface CertificationRequirement {
  /** Normalised identity used to compare against vendor credentials. */
  code: string;
  /** How the requirement was written, for the explanation. */
  label: string;
  sourceText: string;
}

/**
 * Certification vocabulary that appears in Indian public procurement. Each
 * entry is a family: `pattern` recognises the requirement in the clause, and
 * `credential` recognises the vendor's recorded credential.
 */
const CERTIFICATION_PATTERNS: ReadonlyArray<{
  code: string;
  label: string;
  requirement: RegExp;
  credential: RegExp;
}> = [
  { code: "ISO_9001", label: "ISO 9001 quality management", requirement: /\biso[\s:-]*9001\b/i, credential: /\biso[\s:-]*9001\b/i },
  { code: "ISO_14001", label: "ISO 14001 environmental management", requirement: /\biso[\s:-]*14001\b/i, credential: /\biso[\s:-]*14001\b/i },
  { code: "ISO_27001", label: "ISO/IEC 27001 information security", requirement: /\biso(?:\/iec)?[\s:-]*27001\b/i, credential: /\biso(?:\/iec)?[\s:-]*27001\b/i },
  { code: "ISO_45001", label: "ISO 45001 occupational health and safety", requirement: /\biso[\s:-]*45001\b/i, credential: /\biso[\s:-]*45001\b/i },
  { code: "ISO_22000", label: "ISO 22000 food safety management", requirement: /\biso[\s:-]*22000\b/i, credential: /\biso[\s:-]*22000\b/i },
  {
    code: "BIS",
    label: "BIS certification",
    requirement: /\b(?:bis|bureau of indian standards)\b/i,
    // An IS number is how a BIS conformity credential is usually recorded.
    credential: /\b(?:bis|bureau of indian standards)\b|\bis\s*\d{3,5}\b/i,
  },
  { code: "FSSAI", label: "FSSAI licence", requirement: /\bfssai\b/i, credential: /\bfssai\b/i },
  { code: "NABL", label: "NABL accreditation", requirement: /\bnabl\b/i, credential: /\bnabl\b/i },
  {
    code: "CPCB",
    label: "Pollution control board authorisation",
    requirement: /\b(?:cpcb|spcb|pollution control board)\b/i,
    credential: /\b(?:cpcb|spcb|pollution control board|consent to (?:operate|establish))\b/i,
  },
  { code: "MSME", label: "MSME / Udyam registration", requirement: /\b(?:msme|udyam)\b/i, credential: /\b(?:msme|udyam)\b/i },
  {
    // "Procured through GeM" describes the channel and obliges the supplier of
    // nothing, so the requirement form needs registration wording. The
    // credential form does not, so "GeM Seller ID 12345" still satisfies it.
    code: "GEM",
    label: "GeM registration",
    requirement:
      /\bgem\b[^.;]{0,40}\b(?:registration|registered|empanel\w*|seller|vendor)\b|\b(?:registration|registered|empanel\w*|listed)\b[^.;]{0,40}\bgem\b/i,
    credential: /\bgem\b|\bgovernment e-?marketplace\b/i,
  },
  { code: "STARTUP_INDIA", label: "Startup India / DPIIT recognition", requirement: /\b(?:startup india|dpiit)\b/i, credential: /\b(?:startup india|dpiit)\b/i },
  { code: "CMMI", label: "CMMI appraisal", requirement: /\bcmmi\b/i, credential: /\bcmmi\b/i },
  {
    code: "CE",
    label: "CE marking",
    requirement: /\bce\s+mark(?:ing|ed)?\b/i,
    credential: /\bce\b[\s-]*(?:mark\w*|declaration|conformity|certificat\w*)/i,
  },
  {
    // Naming the department is not the same as requiring registration with it:
    // "coordinated with the Public Works Department" imposes nothing on the
    // supplier, and gating on it excluded every supplier from a package that
    // merely mentioned the department. The requirement form therefore needs
    // registration wording in the same clause, in either order; the credential
    // form matches the issuing body alone, so "Class I Contractor registration
    // — Karnataka Public Works Department" is recognised whichever way round.
    code: "PWD_LICENCE",
    label: "PWD / public works contractor registration",
    requirement:
      /\b(?:pwd|public works department)\b[^.;]{0,60}\b(?:registration|registered|licen[cs]e|class\s*[ivx1-9]|empanel\w*|enlist\w*)\b|\b(?:registration|registered|licen[cs]e|class\s*[ivx1-9]|empanel\w*|enlist\w*)\b[^.;]{0,60}\b(?:pwd|public works department)\b/i,
    credential: /\b(?:pwd|public works department)\b/i,
  },
  {
    code: "ELECTRICAL_LICENCE",
    label: "Electrical contractor licence",
    requirement: /\belectrical\s+(?:contractor|licen[cs]e)/i,
    credential: /\belectrical\s+(?:contractor|licen[cs]e)/i,
  },
];

/**
 * Wording that makes a clause mandatory. A clause that merely mentions a
 * standard ("comparable to ISO 9001") is not a gate; only an obligation is.
 */
const MANDATORY_MARKERS =
  /\b(?:must|shall|mandatory|mandatorily|required to|require[sd]?\s+(?:to|that)?|obligator(?:y|ily)|essential|prerequisite|pre-?qualification|only\s+(?:vendors|suppliers|bidders)|non-?negotiable)\b/i;

/**
 * Wording that makes a clause an advantage rather than a condition.
 *
 * These override the obligation markers, because the two routinely occur in one
 * sentence: "Preference **shall** be given to MSME bidders" carries "shall" but
 * obliges nobody. Reading it as a gate would exclude every non-MSME supplier
 * from a procurement that merely favoured them — an exclusion the procurement
 * never asked for and the officer would have no reason to look for.
 */
const PREFERENCE_MARKERS =
  /\b(?:preference|preferential|preferably|preferred|desirable|advantage|bonus|optional|encouraged|wherever possible|if available|will be viewed favourably|may\s+(?:also\s+)?(?:hold|have|possess|be))\b/i;

/**
 * Splits a requirement into the clauses an obligation can scope over.
 *
 * Necessary because the obligation and the standard are matched against the
 * same span: testing a whole multi-clause requirement lets "the vendor must
 * comply with safety norms; BIS-marked equipment is preferred" register BIS as
 * mandatory on the strength of a "must" belonging to a different clause.
 */
function clausesOf(text: string): string[] {
  return text
    .split(/(?<=[.;:])\s+|\n+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== "");
}

/**
 * Extracts the certifications a supplier is obliged to hold.
 *
 * A gate is produced only where one clause both imposes an obligation and names
 * the standard, and does not frame it as a preference. Both halves of that test
 * exist because either error excludes a supplier who was entitled to bid.
 */
export function extractCertificationRequirements(
  texts: readonly string[],
): CertificationRequirement[] {
  const found = new Map<string, CertificationRequirement>();

  for (const text of texts) {
    for (const clause of clausesOf(text)) {
      if (!MANDATORY_MARKERS.test(clause)) continue;
      if (PREFERENCE_MARKERS.test(clause)) continue;

      for (const candidate of CERTIFICATION_PATTERNS) {
        if (found.has(candidate.code)) continue;
        if (!candidate.requirement.test(clause)) continue;

        found.set(candidate.code, {
          code: candidate.code,
          label: candidate.label,
          // The clause rather than the whole requirement: it is what imposed
          // the gate, and it is what the officer is shown as the reason.
          sourceText: clause,
        });
      }
    }
  }

  return [...found.values()];
}

/**
 * Recognises a vendor's recorded credential as satisfying a requirement code.
 * Matching is on the credential's own text, so a supplier is only ever credited
 * with something they actually recorded.
 */
export function credentialSatisfies(
  requirementCode: string,
  credentialText: string,
): boolean {
  const candidate = CERTIFICATION_PATTERNS.find((entry) => entry.code === requirementCode);
  return candidate === undefined ? false : candidate.credential.test(credentialText);
}

/**
 * Indian states and union territories, plus the handful of region words that
 * behave like a delivery constraint. Matching is on the written name only.
 */
const REGIONS: readonly string[] = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry",
];

/**
 * The states a package is to be delivered in. Absence of a named state is not a
 * constraint — most packages do not name one, and inferring a location from a
 * department's name would be exactly the kind of invention eligibility must not
 * do.
 */
export function extractRegions(texts: readonly string[]): string[] {
  const joined = texts.join(" \n ");
  const found: string[] = [];

  for (const region of REGIONS) {
    const pattern = new RegExp(`\\b${region.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(joined)) found.push(region);
  }

  return found;
}

/**
 * The rupee ceiling stated in the budget requirements, in rupees.
 *
 * Only the largest stated amount is returned: a budget clause that mentions
 * both a total outlay and a smaller sub-head describes one package whose value
 * is the larger figure, and gating on the smaller one would exclude every
 * supplier capable of the actual work.
 */
export function extractMonetaryCeilingInr(texts: readonly string[]): number | null {
  let ceiling: number | null = null;

  // `rs` and `inr` need a leading word boundary. Without one they match the
  // tail of any word ending in those letters, so "deploy 40 workers 500 hours"
  // parsed as ₹500 and became the package's stated value — which then let every
  // supplier clear the capacity gate and inflated their capacity score.
  const pattern =
    /(?:₹|\brs\b\.?|\binr\b)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr\b|lakh|lac|thousand|k\b)?|([\d,]+(?:\.\d+)?)\s*(crore|lakh|lac)\b/gi;

  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      const rawAmount = match[1] ?? match[3];
      const rawUnit = match[2] ?? match[4];
      if (rawAmount === undefined) continue;

      const amount = Number.parseFloat(rawAmount.replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const unit = rawUnit?.toLowerCase() ?? "";
      const multiplier = unit.startsWith("cr")
        ? 10_000_000
        : unit.startsWith("lakh") || unit.startsWith("lac")
          ? 100_000
          : unit.startsWith("thousand") || unit === "k"
            ? 1_000
            : 1;

      const value = amount * multiplier;
      if (ceiling === null || value > ceiling) ceiling = value;
    }
  }

  return ceiling;
}

/** Formats rupees the way the rest of the portal does, for explanation text. */
export function formatInr(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} crore`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} lakh`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}
