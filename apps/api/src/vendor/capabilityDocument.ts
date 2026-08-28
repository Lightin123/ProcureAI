/**
 * Builds the AI-ready representation of a vendor profile.
 *
 * Two artefacts come out of the same input, because matching needs both and
 * neither is sufficient alone (see ../../docs/ai/vendor-discovery.md):
 *
 *  - `document` — a natural-language capability statement. Codes are resolved
 *    to their human labels and the vendor's own prose is preserved verbatim,
 *    so an embedding model or an LLM reads sentences rather than enum values.
 *    This is what semantic matching will embed in Milestone 6's vector work.
 *
 *  - `keywords` — a normalised token set for deterministic filtering and for
 *    the explainable lexical matching the portal uses today.
 *
 * It is rebuilt on every profile write, so it can never describe a stale
 * version of the profile.
 */

import { getByPath, isAnswered, type ProfileValues } from "./completion.js";
import { ONBOARDING_STEPS } from "./onboardingSchema.js";
import { labelFor } from "./taxonomy.js";

export interface CapabilitySourceOffering {
  kind: string;
  name: string;
  description: string | null;
  categories: string[];
  tags: string[];
  sectors: string[];
}

export interface CapabilitySourceExperience {
  title: string;
  clientName: string | null;
  clientType: string | null;
  sector: string | null;
  description: string | null;
  outcome: string | null;
  startYear: number | null;
  endYear: number | null;
}

export interface CapabilitySourceCredential {
  kind: string;
  name: string;
  issuingAuthority: string | null;
}

export interface CapabilitySources {
  offerings: readonly CapabilitySourceOffering[];
  experience: readonly CapabilitySourceExperience[];
  credentials: readonly CapabilitySourceCredential[];
}

export interface CapabilityDocument {
  document: string;
  keywords: string[];
}

/**
 * Words that appear in nearly every procurement description and would match
 * every vendor. Removing them is what stops "the system shall provide" from
 * scoring as a capability overlap.
 */
const STOP_WORDS = new Set([
  // Ordinary English connective vocabulary.
  "the", "and", "for", "with", "that", "this", "from", "shall", "must", "will", "are", "was",
  "were", "have", "has", "had", "not", "all", "any", "our", "your", "their", "its", "into",
  "such", "than", "then", "them", "they", "which", "while", "where", "when", "what", "who",
  "can", "may", "also", "each", "other", "more", "most", "some", "very", "over", "under",
  "across", "within", "between", "through", "including", "include", "included", "provide",
  "provided", "providing", "based", "using", "used", "use", "need", "needs", "required",
  "requirement", "requirements", "solution", "solutions", "service", "services", "system",
  "systems", "project", "projects", "work", "works", "new", "one", "two", "per", "via",
  "should", "would", "could", "about", "after", "before", "during", "both", "been", "being",
  "we", "us", "it", "is", "of", "in", "to", "on", "at", "by", "as", "an", "a", "or", "be",

  // Procurement boilerplate. These appear in almost every tender and in almost
  // every supplier profile, so counting them as capability overlap made every
  // supplier look like a match for every requirement. Words that carry real
  // domain meaning are deliberately absent from this list — "training",
  // "capacity", "supply", "storage" and the like stay, because for a training
  // provider or a cold-chain operator they are the capability.
  "government", "governmental", "department", "departmental", "ministry", "office",
  "official", "officer", "authority", "public", "tender", "procurement", "procure",
  "contract", "contracts", "contractual", "supplier", "suppliers", "vendor", "vendors",
  "bidder", "bidders", "proposal", "proposals", "scope", "clause", "annexure",
  "capability", "capabilities", "implementation", "implement", "implemented",
  "deliverable", "deliverables", "delivery", "deliver", "delivered",
  "organisation", "organization", "organisations", "organizations", "entity",
  "compliance", "compliant", "conformity", "specification", "specifications",
  "sanctioned", "outlay", "package", "packages", "programme", "programmes", "program",
  "furnish", "furnished", "submit", "submitted", "submission", "ensure", "maintain",
  "maintained", "comply", "applicable", "relevant", "respective", "existing", "present",
  "current", "valid", "total", "number", "cent", "percentage", "minimum", "maximum",
  "period", "date", "dates", "day", "days", "week", "weeks", "month", "months", "year",
  "years", "schedule", "scheduled", "duration", "commencing", "completed", "completion",
  "three", "four", "five", "six", "seven", "eight", "nine", "ten", "first", "second",
  "following", "above", "below", "rather", "given", "own", "access", "committed",
  "state", "states", "central", "national", "record", "records", "report", "reports",
  "reported", "reporting", "format", "level", "levels", "stage", "stages", "process",
  "processes", "support", "supported", "quality", "standard", "standards",
]);

function normaliseToken(token: string): string {
  // Interior punctuation is kept, so "iso-9001", "3.5" and "c++" survive; the
  // leading and trailing kind is stripped, so "schedule." and "supply," do not
  // become distinct terms from the words they are.
  return token
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]/g, "")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");
}

/** Tokenises free text into content words, dropping stop words and noise. */
export function tokenise(text: string): string[] {
  return text
    .split(/[\s,;:/()[\]{}"'|\\]+/)
    .map(normaliseToken)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function pushKeywords(target: Set<string>, values: unknown): void {
  if (values === undefined || values === null) return;

  const list = Array.isArray(values) ? values : [values];
  for (const value of list) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value);

    // The phrase is kept alongside its tokens: "cold chain logistics" should
    // match as a phrase and as its parts.
    const phrase = text.toLowerCase().trim();
    if (phrase.length >= 3 && phrase.length <= 60) target.add(phrase);

    for (const token of tokenise(text)) target.add(token);
  }
}

function labelList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string").map(labelFor);
}

function stringOf(values: ProfileValues, path: string): string | undefined {
  const value = getByPath(values, path);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function sentence(label: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${label}: ${value}`;
}

function joinList(values: readonly string[]): string | undefined {
  const filtered = values.filter((value) => value.trim() !== "");
  return filtered.length === 0 ? undefined : filtered.join(", ");
}

function formatInr(value: unknown): string | undefined {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return undefined;

  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} crore`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} lakh`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * The conditional answers are the industry-specific detail — production
 * capacity for a manufacturer, agro-climatic zones for a field operator. They
 * are read back through the schema so each one is written out with the
 * question it answered rather than as a bare key.
 */
function dynamicAnswerLines(values: ProfileValues): string[] {
  const lines: string[] = [];

  for (const step of ONBOARDING_STEPS) {
    for (const group of step.groups) {
      const groupLines: string[] = [];

      for (const field of group.fields) {
        if (!field.path.startsWith("dynamicAnswers.")) continue;

        const value = getByPath(values, field.path);
        if (!isAnswered(value)) continue;

        const rendered = Array.isArray(value) ? value.join(", ") : String(value);
        groupLines.push(`- ${field.label}: ${rendered}`);
      }

      if (groupLines.length > 0) {
        lines.push(`${group.title}:`);
        lines.push(...groupLines);
      }
    }
  }

  return lines;
}

export function buildCapabilityDocument(
  values: ProfileValues,
  sources: CapabilitySources,
): CapabilityDocument {
  const keywords = new Set<string>();
  const sections: string[] = [];

  const name = stringOf(values, "legalName") ?? "This organisation";
  const industries = labelList(getByPath(values, "industries"));
  const solutionTypes = labelList(getByPath(values, "solutionTypes"));
  const subDomains = Array.isArray(getByPath(values, "subDomains"))
    ? (getByPath(values, "subDomains") as string[])
    : [];

  pushKeywords(keywords, getByPath(values, "industries"));
  pushKeywords(keywords, industries);
  pushKeywords(keywords, solutionTypes);
  pushKeywords(keywords, subDomains);

  // ---- Identity ----------------------------------------------------------
  const identity: string[] = [`ORGANISATION: ${name}`];
  const headline = stringOf(values, "headline");
  if (headline !== undefined) {
    identity.push(headline);
    pushKeywords(keywords, headline);
  }
  identity.push(
    ...[
      sentence("Entity type", labelFor(stringOf(values, "organizationType") ?? "")),
      sentence("Established", stringOf(values, "yearEstablished")),
      sentence("Industries", joinList(industries)),
      sentence("Sub-domains", joinList(subDomains)),
      sentence("Solution types", joinList(solutionTypes)),
      sentence("Other category", stringOf(values, "otherSolutionType")),
    ].filter((line): line is string => line !== undefined),
  );
  sections.push(identity.join("\n"));

  // ---- Eligibility -------------------------------------------------------
  const eligibilityFlags = labelList(getByPath(values, "eligibility.flags"));
  if (eligibilityFlags.length > 0) {
    pushKeywords(keywords, getByPath(values, "eligibility.flags"));
    sections.push(`ELIGIBILITY CATEGORIES\n${eligibilityFlags.join(", ")}`);
  }

  // ---- Capability narrative ---------------------------------------------
  const narrative: string[] = [];
  for (const [label, path] of [
    ["What the organisation does", "capabilitySummary"],
    ["Problems solved", "problemBeingSolved"],
    ["Key differentiators", "differentiators"],
    ["Value proposition", "valueProposition"],
  ] as const) {
    const text = stringOf(values, path);
    if (text !== undefined) {
      narrative.push(`${label}:\n${text}`);
      pushKeywords(keywords, text);
    }
  }
  if (narrative.length > 0) {
    sections.push(`CAPABILITY STATEMENT\n${narrative.join("\n\n")}`);
  }

  // ---- Structured capability tags ---------------------------------------
  const tagLines: string[] = [];
  for (const [label, path] of [
    ["Core capabilities", "coreCapabilities"],
    ["Areas of expertise", "expertiseAreas"],
    ["Problem domains", "problemDomains"],
    ["Sectors served", "sectorsServed"],
    ["Typical customers", "targetCustomers"],
    ["Domain expertise in team", "domainExpertise"],
  ] as const) {
    const value = getByPath(values, path);
    const joined = Array.isArray(value) ? joinList(value as string[]) : undefined;
    if (joined !== undefined) {
      tagLines.push(`${label}: ${joined}`);
      pushKeywords(keywords, value);
    }
  }
  if (tagLines.length > 0) {
    sections.push(`CAPABILITIES\n${tagLines.join("\n")}`);
  }

  // ---- Offerings ---------------------------------------------------------
  if (sources.offerings.length > 0) {
    const lines = sources.offerings.map((offering) => {
      pushKeywords(keywords, offering.name);
      pushKeywords(keywords, offering.categories);
      pushKeywords(keywords, offering.tags);
      pushKeywords(keywords, offering.sectors);
      if (offering.description !== null) pushKeywords(keywords, offering.description);

      const detail = [
        offering.description ?? undefined,
        joinList(offering.categories) === undefined
          ? undefined
          : `Categories: ${joinList(offering.categories)}`,
        joinList(offering.sectors) === undefined
          ? undefined
          : `Sectors: ${joinList(offering.sectors)}`,
        joinList(offering.tags) === undefined ? undefined : `Tags: ${joinList(offering.tags)}`,
      ]
        .filter((line): line is string => line !== undefined)
        .join(" | ");

      return `- [${labelFor(offering.kind)}] ${offering.name}${detail === "" ? "" : ` — ${detail}`}`;
    });

    sections.push(`PRODUCTS, SERVICES AND CAPABILITIES OFFERED\n${lines.join("\n")}`);
  }

  // ---- Delivery and coverage --------------------------------------------
  const deliveryLines = [
    sentence("Delivery models", joinList(labelList(getByPath(values, "deliveryModels")))),
    sentence("Geographic coverage", labelFor(stringOf(values, "serviceCoverage") ?? "")),
    sentence("Operating locations", joinList(
      Array.isArray(getByPath(values, "operatingStates"))
        ? (getByPath(values, "operatingStates") as string[])
        : [],
    )),
    sentence("Coverage notes", stringOf(values, "coverageNotes")),
  ].filter((line): line is string => line !== undefined && !line.endsWith(": "));

  if (deliveryLines.length > 0) {
    pushKeywords(keywords, getByPath(values, "deliveryModels"));
    pushKeywords(keywords, getByPath(values, "operatingStates"));
    pushKeywords(keywords, stringOf(values, "coverageNotes"));
    sections.push(`DELIVERY AND COVERAGE\n${deliveryLines.join("\n")}`);
  }

  // ---- Capacity ----------------------------------------------------------
  const capacityLines = [
    sentence("Team size", stringOf(values, "teamSize")),
    sentence("Delivery capability", stringOf(values, "deliveryCapability")),
    sentence("Production or service capacity", stringOf(values, "capacityNotes")),
    sentence("Scalability", stringOf(values, "scalabilityNotes")),
    sentence("Infrastructure and resources", stringOf(values, "infrastructureNotes")),
    sentence(
      "Government-scale readiness",
      labelFor(stringOf(values, "governmentScaleReadiness") ?? ""),
    ),
    sentence("Minimum project value", formatInr(getByPath(values, "minProjectValueInr"))),
    sentence("Typical project value", formatInr(getByPath(values, "typicalProjectValueInr"))),
    sentence("Maximum project value", formatInr(getByPath(values, "maxProjectValueInr"))),
  ].filter((line): line is string => line !== undefined && !line.endsWith(": "));

  if (capacityLines.length > 0) {
    for (const path of [
      "deliveryCapability",
      "capacityNotes",
      "scalabilityNotes",
      "infrastructureNotes",
    ]) {
      pushKeywords(keywords, stringOf(values, path));
    }
    sections.push(`CAPACITY AND OPERATIONS\n${capacityLines.join("\n")}`);
  }

  // ---- Industry-specific answers ----------------------------------------
  const dynamicLines = dynamicAnswerLines(values);
  if (dynamicLines.length > 0) {
    const dynamicValues = getByPath(values, "dynamicAnswers");
    if (typeof dynamicValues === "object" && dynamicValues !== null) {
      for (const value of Object.values(dynamicValues as Record<string, unknown>)) {
        pushKeywords(keywords, value);
      }
    }
    sections.push(`INDUSTRY-SPECIFIC CAPABILITY DETAIL\n${dynamicLines.join("\n")}`);
  }

  // ---- Experience --------------------------------------------------------
  const experienceLines: string[] = [];
  const historyLines = [
    sentence("Government experience", labelFor(stringOf(values, "governmentExperience") ?? "")),
    sentence(
      "GeM registered",
      getByPath(values, "gemRegistered") === true
        ? "Yes"
        : getByPath(values, "gemRegistered") === false
          ? "No"
          : undefined,
    ),
    sentence("Past tender experience", stringOf(values, "pastTenderExperience")),
  ].filter((line): line is string => line !== undefined && !line.endsWith(": "));
  experienceLines.push(...historyLines);
  pushKeywords(keywords, stringOf(values, "pastTenderExperience"));

  for (const item of sources.experience) {
    pushKeywords(keywords, item.title);
    pushKeywords(keywords, item.sector);
    if (item.description !== null) pushKeywords(keywords, item.description);
    if (item.outcome !== null) pushKeywords(keywords, item.outcome);

    const period =
      item.startYear === null
        ? ""
        : ` (${item.startYear}${item.endYear === null ? " onwards" : `–${item.endYear}`})`;
    const client =
      item.clientName === null
        ? item.clientType === null
          ? ""
          : ` for a ${labelFor(item.clientType).toLowerCase()} client`
        : ` for ${item.clientName}`;

    experienceLines.push(
      `- ${item.title}${client}${period}` +
        `${item.description === null ? "" : `. ${item.description}`}` +
        `${item.outcome === null ? "" : ` Outcome: ${item.outcome}`}`,
    );
  }

  if (experienceLines.length > 0) {
    sections.push(`EXPERIENCE AND PAST PERFORMANCE\n${experienceLines.join("\n")}`);
  }

  // ---- Credentials -------------------------------------------------------
  if (sources.credentials.length > 0) {
    const lines = sources.credentials.map((credential) => {
      pushKeywords(keywords, credential.name);
      return `- [${labelFor(credential.kind)}] ${credential.name}${
        credential.issuingAuthority === null ? "" : ` — ${credential.issuingAuthority}`
      }`;
    });
    sections.push(`CERTIFICATIONS, STANDARDS AND RECOGNITION\n${lines.join("\n")}`);
  }

  // ---- Innovation --------------------------------------------------------
  const innovationLines = [
    sentence("Nature of solution", labelFor(stringOf(values, "solutionNovelty") ?? "")),
    sentence("Current stage", labelFor(stringOf(values, "innovationStage") ?? "")),
    sentence("Deployment readiness", labelFor(stringOf(values, "deploymentReadiness") ?? "")),
    sentence("What is new about the approach", stringOf(values, "innovationDescription")),
    sentence("Measurable impact", stringOf(values, "measurableImpact")),
    sentence("Intellectual property", stringOf(values, "intellectualPropertyDetails")),
  ].filter((line): line is string => line !== undefined && !line.endsWith(": "));

  if (innovationLines.length > 0) {
    pushKeywords(keywords, stringOf(values, "innovationDescription"));
    pushKeywords(keywords, stringOf(values, "measurableImpact"));
    sections.push(`INNOVATION PROFILE\n${innovationLines.join("\n")}`);
  }

  return {
    document: sections.join("\n\n"),
    keywords: [...keywords].sort(),
  };
}
