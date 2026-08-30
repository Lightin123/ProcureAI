/**
 * The shape of a demonstration supplier.
 *
 * One entry describes an organisation completely: its account, its onboarding
 * answers, what it sells, what it has delivered, what it holds, and the
 * compliance documents it filed. The seeder writes every one of those through
 * the same repositories and derivation code the running API uses, so a seeded
 * supplier is indistinguishable from one that completed the questionnaire.
 *
 * `profile` is deliberately typed as a loose record rather than a bespoke
 * interface: it is validated at seed time against `profilePatchSchema`, the
 * same schema the `PATCH /api/v1/vendor/profile` route validates against, and
 * its `dynamicAnswers` keys are checked against the onboarding schema's own
 * declared questions. A second, hand-maintained TypeScript mirror of those
 * rules would be a place for them to drift.
 *
 * Every value in these files is fictional. No real organisation, individual,
 * registration number, certificate or contract is represented.
 */

export interface CatalogueOffering {
  kind: "PRODUCT" | "SERVICE" | "CAPABILITY";
  name: string;
  description: string;
  categories: string[];
  tags: string[];
  sectors: string[];
}

export interface CatalogueExperience {
  title: string;
  clientName: string;
  clientType:
    | "CENTRAL_GOVERNMENT"
    | "STATE_GOVERNMENT"
    | "PSU"
    | "URBAN_LOCAL_BODY"
    | "PRIVATE"
    | "NGO"
    | "ACADEMIC"
    | "INTERNATIONAL";
  sector: string;
  description: string;
  outcome: string;
  contractValueInr: number;
  startYear: number;
  endYear: number | null;
}

export interface CatalogueCredential {
  kind:
    | "CERTIFICATION"
    | "LICENCE"
    | "QUALITY_STANDARD"
    | "AWARD"
    | "INTELLECTUAL_PROPERTY"
    | "EMPANELMENT";
  name: string;
  issuingAuthority: string;
  identifier: string | null;
  issuedOn: string | null;
  /**
   * Null where the credential does not expire. A date in the past is a
   * deliberate choice on the few suppliers that exist to exercise the
   * eligibility gate's credential-validity check.
   */
  validUntil: string | null;
  notes: string | null;
}

export interface CatalogueDocument {
  documentType: string;
  title: string;
  referenceNumber: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  /** What the generated PDF says the document attests. */
  body: string[];
}

export interface CatalogueVendor {
  /** Stable across runs; the organization is upserted on it. */
  organizationCode: string;
  organizationName: string;
  /** The supplier's own account. Upserted on the address, so re-running is safe. */
  email: string;
  fullName: string;

  /** Onboarding answers, keyed exactly as the onboarding schema addresses them. */
  profile: Record<string, unknown>;

  offerings: CatalogueOffering[];
  experience: CatalogueExperience[];
  credentials: CatalogueCredential[];
  documents: CatalogueDocument[];

  /** Recorded as the administrator's verification note. */
  verificationNotes: string;

  /**
   * Why this supplier is in the dataset — what it should demonstrate when a
   * work package is matched against the registry. Not written to the database;
   * it exists so the dataset's coverage can be read without running a match.
   */
  matchingRole: string;
}
