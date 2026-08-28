/**
 * The onboarding questionnaire, expressed as data.
 *
 * The portal renders this schema rather than hard-coding a form, and the same
 * schema drives validation, the completion percentage and the capability
 * document. One definition, three consumers, no possibility of drift (D58).
 *
 * `showIf` is what makes onboarding adaptive: a field or a whole group appears
 * only when the vendor's own answers make it relevant. A soil-testing
 * laboratory is never asked about deployment models, and a road contractor is
 * never asked about programming languages.
 */

import {
  CLIENT_TYPES,
  CREDENTIAL_KINDS,
  DELIVERY_MODELS,
  DEPLOYMENT_READINESS,
  DOCUMENT_TYPES,
  ELIGIBILITY_FLAGS,
  GOVERNMENT_EXPERIENCE,
  GOVERNMENT_SCALE_READINESS,
  INDUSTRIES,
  INNOVATION_STAGE,
  OFFERING_KINDS,
  ORGANIZATION_TYPES,
  SERVICE_COVERAGE,
  SOLUTION_NOVELTY,
  SOLUTION_TYPES,
  type TaxonomyOption,
} from "./taxonomy.js";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "year"
  | "currency"
  | "url"
  | "email"
  | "tel"
  | "select"
  | "multiselect"
  | "tags"
  | "states"
  | "state"
  | "subdomains"
  | "boolean";

/**
 * A single condition. `includesAny` covers both array-valued fields
 * (industries, solutionTypes) and scalars, which keeps the client-side
 * evaluator to one code path.
 */
export interface FieldCondition {
  path: string;
  includesAny: readonly string[];
}

/** Conditions are OR-ed: any match shows the field. */
export interface ShowIf {
  any: readonly FieldCondition[];
}

export interface OnboardingField {
  /** Dotted path into the profile draft, e.g. `registeredAddress.city`. */
  path: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  rows?: number;
  options?: readonly TaxonomyOption[];
  showIf?: ShowIf;
  /** Renders the field at full width instead of in the two-column grid. */
  wide?: boolean;
}

export interface OnboardingGroup {
  id: string;
  title: string;
  description?: string;
  showIf?: ShowIf;
  fields: readonly OnboardingField[];
}

export type CollectionId = "offerings" | "experience" | "credentials" | "documents";

export interface OnboardingStep {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  groups: readonly OnboardingGroup[];
  /** Repeatable entities managed through their own endpoints. */
  collections?: readonly CollectionId[];
  /** Weight in the completion percentage. */
  weight: number;
}

const when = (path: string, ...values: string[]): ShowIf => ({
  any: [{ path, includesAny: values }],
});

const whenAny = (...conditions: FieldCondition[]): ShowIf => ({ any: conditions });

const industryIs = (...values: string[]): FieldCondition => ({
  path: "industries",
  includesAny: values,
});

const solutionIs = (...values: string[]): FieldCondition => ({
  path: "solutionTypes",
  includesAny: values,
});

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "organisation",
    title: "Organisation Details",
    shortTitle: "Organisation",
    description:
      "Particulars of the registered entity, as they appear on your incorporation and tax records.",
    weight: 18,
    groups: [
      {
        id: "identity",
        title: "Registered Entity",
        fields: [
          {
            path: "legalName",
            label: "Registered organisation name",
            type: "text",
            required: true,
            maxLength: 200,
            hint: "Exactly as recorded on your certificate of incorporation or registration.",
          },
          {
            path: "organizationType",
            label: "Type of organisation",
            type: "select",
            required: true,
            options: ORGANIZATION_TYPES,
          },
          {
            path: "yearEstablished",
            label: "Year established",
            type: "year",
            required: true,
            min: 1800,
            max: 2100,
          },
          {
            path: "registrationNumber",
            label: "Registration number",
            type: "text",
            maxLength: 100,
            hint: "CIN, LLPIN, firm registration number or equivalent.",
          },
          {
            path: "website",
            label: "Website",
            type: "url",
            maxLength: 300,
            placeholder: "https://",
          },
        ],
      },
      {
        id: "identifiers",
        title: "Statutory Identifiers",
        description:
          "Provide the identifiers that apply to your entity. Leave the rest blank — none of them is mandatory for every organisation type.",
        fields: [
          { path: "identifiers.gstin", label: "GSTIN", type: "text", maxLength: 20 },
          { path: "identifiers.pan", label: "PAN", type: "text", maxLength: 12 },
          { path: "identifiers.cin", label: "CIN", type: "text", maxLength: 30 },
          {
            path: "identifiers.udyam",
            label: "Udyam registration number",
            type: "text",
            maxLength: 30,
          },
          {
            path: "identifiers.dpiit",
            label: "DPIIT recognition number",
            type: "text",
            maxLength: 30,
          },
          {
            path: "identifiers.gemSellerId",
            label: "GeM seller ID",
            type: "text",
            maxLength: 40,
          },
        ],
      },
      {
        id: "eligibility",
        title: "Eligibility and Preference Categories",
        description:
          "Select every category your organisation qualifies under. These affect eligibility for reserved and preferential procurement.",
        fields: [
          {
            path: "eligibility.flags",
            label: "Applicable categories",
            type: "multiselect",
            options: ELIGIBILITY_FLAGS,
            wide: true,
          },
          {
            path: "eligibility.msmeCategory",
            label: "MSME category",
            type: "select",
            options: [
              { value: "MICRO", label: "Micro" },
              { value: "SMALL", label: "Small" },
              { value: "MEDIUM", label: "Medium" },
            ],
            showIf: when("eligibility.flags", "msme"),
          },
        ],
      },
      {
        id: "address",
        title: "Registered Address",
        fields: [
          {
            path: "registeredAddress.line1",
            label: "Address line 1",
            type: "text",
            required: true,
            maxLength: 200,
          },
          {
            path: "registeredAddress.line2",
            label: "Address line 2",
            type: "text",
            maxLength: 200,
          },
          { path: "registeredAddress.city", label: "City / town", type: "text", required: true },
          { path: "registeredAddress.district", label: "District", type: "text" },
          {
            path: "registeredAddress.state",
            label: "State / union territory",
            type: "state",
            required: true,
          },
          { path: "registeredAddress.pincode", label: "PIN code", type: "text", maxLength: 10 },
        ],
      },
      {
        id: "operations",
        title: "Operating Locations",
        fields: [
          {
            path: "operatingStates",
            label: "States and union territories where you operate",
            type: "states",
            required: true,
            wide: true,
            hint: "Select every location where you can actually deliver, not only where you are registered.",
          },
        ],
      },
      {
        id: "contacts",
        title: "Contact and Authorised Representative",
        description:
          "The authorised representative is the person empowered to make commitments on behalf of the organisation.",
        fields: [
          {
            path: "primaryContact.name",
            label: "Primary contact name",
            type: "text",
            required: true,
          },
          { path: "primaryContact.designation", label: "Designation", type: "text" },
          {
            path: "primaryContact.email",
            label: "Contact email",
            type: "email",
            required: true,
          },
          { path: "primaryContact.phone", label: "Contact telephone", type: "tel" },
          {
            path: "authorisedRepresentative.name",
            label: "Authorised representative name",
            type: "text",
            required: true,
          },
          {
            path: "authorisedRepresentative.designation",
            label: "Representative designation",
            type: "text",
          },
          {
            path: "authorisedRepresentative.email",
            label: "Representative email",
            type: "email",
          },
          {
            path: "authorisedRepresentative.phone",
            label: "Representative telephone",
            type: "tel",
          },
        ],
      },
    ],
  },

  {
    id: "classification",
    title: "Business Classification",
    shortTitle: "Classification",
    description:
      "How your organisation should be classified for procurement matching. Your selections here decide which questions the remaining steps ask.",
    weight: 12,
    groups: [
      {
        id: "industry",
        title: "Industry and Domain",
        fields: [
          {
            path: "industries",
            label: "Industries and domains you operate in",
            type: "multiselect",
            required: true,
            wide: true,
            options: INDUSTRIES,
            hint: "Select every domain that genuinely applies. Most organisations select one to three.",
          },
          {
            path: "subDomains",
            label: "Sub-domains",
            type: "subdomains",
            wide: true,
            hint: "Drawn from the industries you selected. Add your own if none fit.",
          },
        ],
      },
      {
        id: "solution",
        title: "Type of Solution Offered",
        description:
          "Select every category that applies. An organisation that manufactures a device and operates the service around it should select both.",
        fields: [
          {
            path: "solutionTypes",
            label: "Solution types",
            type: "multiselect",
            required: true,
            wide: true,
            options: SOLUTION_TYPES,
          },
          {
            path: "otherSolutionType",
            label: "Describe your solution category",
            type: "text",
            wide: true,
            maxLength: 200,
            showIf: whenAny(solutionIs("OTHER_SOLUTION"), industryIs("OTHER_INDUSTRY")),
          },
        ],
      },
    ],
  },

  {
    id: "capabilities",
    title: "Products, Services and Capabilities",
    shortTitle: "Capabilities",
    description:
      "What you offer, what you are good at, and the problems you solve. This is the material the platform uses to match you to government requirements, so describe it in your own words rather than in keywords.",
    weight: 22,
    collections: ["offerings"],
    groups: [
      {
        id: "summary",
        title: "Capability Statement",
        fields: [
          {
            path: "headline",
            label: "One-line description of your organisation",
            type: "text",
            required: true,
            maxLength: 200,
            wide: true,
            placeholder:
              "e.g. Precision sheet-metal fabrication for railway and defence assemblies",
          },
          {
            path: "capabilitySummary",
            label: "What your organisation does",
            type: "textarea",
            required: true,
            rows: 6,
            maxLength: 4000,
            wide: true,
            hint: "Write plainly and completely. This paragraph carries more weight in matching than any single tag.",
          },
          {
            path: "problemBeingSolved",
            label: "Problems you solve for your customers",
            type: "textarea",
            rows: 4,
            maxLength: 3000,
            wide: true,
          },
        ],
      },
      {
        id: "structured",
        title: "Structured Capability Tags",
        description:
          "Short entries, one idea each. These are used for deterministic filtering alongside the descriptions above.",
        fields: [
          {
            path: "coreCapabilities",
            label: "Core capabilities",
            type: "tags",
            required: true,
            wide: true,
            hint: "e.g. CNC machining, cold-chain operation, water quality testing",
          },
          { path: "expertiseAreas", label: "Areas of expertise", type: "tags", wide: true },
          {
            path: "problemDomains",
            label: "Problem domains you address",
            type: "tags",
            wide: true,
            hint: "e.g. crop yield loss, urban waterlogging, hospital record keeping",
          },
          { path: "sectorsServed", label: "Sectors served", type: "tags", wide: true },
          {
            path: "targetCustomers",
            label: "Typical customers",
            type: "tags",
            wide: true,
            hint: "e.g. municipal corporations, district hospitals, farmer collectives",
          },
        ],
      },
      {
        id: "differentiation",
        title: "Differentiation and Value",
        fields: [
          {
            path: "differentiators",
            label: "Key differentiators",
            type: "textarea",
            rows: 4,
            maxLength: 3000,
            wide: true,
            hint: "What a buyer gets from you that they would not get from a comparable supplier.",
          },
          {
            path: "valueProposition",
            label: "Value proposition for a government buyer",
            type: "textarea",
            rows: 4,
            maxLength: 3000,
            wide: true,
          },
        ],
      },
      {
        id: "delivery",
        title: "Delivery and Coverage",
        fields: [
          {
            path: "deliveryModels",
            label: "How you deliver",
            type: "multiselect",
            required: true,
            wide: true,
            options: DELIVERY_MODELS,
          },
          {
            path: "serviceCoverage",
            label: "Geographic coverage",
            type: "select",
            required: true,
            options: SERVICE_COVERAGE,
          },
          {
            path: "coverageNotes",
            label: "Coverage notes",
            type: "textarea",
            rows: 3,
            maxLength: 2000,
            wide: true,
            hint: "Districts, corridors, service centres, partner network — anything that qualifies your reach.",
          },
        ],
      },
    ],
  },

  {
    id: "capacity",
    title: "Capacity and Operations",
    shortTitle: "Capacity",
    description:
      "Your ability to actually execute. The questions below adapt to the industries and solution types you selected.",
    weight: 16,
    groups: [
      {
        id: "team",
        title: "Team and Organisation",
        fields: [
          { path: "teamSize", label: "Total team size", type: "number", required: true, min: 0 },
          {
            path: "domainExpertise",
            label: "Domain expertise present in the team",
            type: "tags",
            wide: true,
            hint: "e.g. structural engineers, agronomists, ISO lead auditors, paediatric nurses",
          },
        ],
      },
      {
        id: "execution",
        title: "Execution Capacity",
        fields: [
          {
            path: "deliveryCapability",
            label: "Delivery capability",
            type: "textarea",
            rows: 4,
            maxLength: 3000,
            wide: true,
            hint: "How much you can deliver, how quickly, and how many engagements you can run at once.",
          },
          {
            path: "capacityNotes",
            label: "Production or service capacity",
            type: "textarea",
            rows: 3,
            maxLength: 2000,
            wide: true,
          },
          {
            path: "scalabilityNotes",
            label: "How you scale up for a larger order",
            type: "textarea",
            rows: 3,
            maxLength: 2000,
            wide: true,
          },
          {
            path: "infrastructureNotes",
            label: "Infrastructure and resources you own or control",
            type: "textarea",
            rows: 3,
            maxLength: 2000,
            wide: true,
          },
          {
            path: "governmentScaleReadiness",
            label: "Readiness for government-scale projects",
            type: "select",
            required: true,
            options: GOVERNMENT_SCALE_READINESS,
          },
        ],
      },
      {
        id: "value",
        title: "Typical Project Size",
        description: "Indicative figures in Indian rupees. They are used to filter out mismatches in either direction.",
        fields: [
          { path: "minProjectValueInr", label: "Minimum project value", type: "currency", min: 0 },
          {
            path: "typicalProjectValueInr",
            label: "Typical project value",
            type: "currency",
            min: 0,
          },
          { path: "maxProjectValueInr", label: "Maximum project value", type: "currency", min: 0 },
        ],
      },

      // ---- Conditional groups. Each appears only for the vendors it concerns.

      {
        id: "manufacturing",
        title: "Manufacturing and Production",
        description: "Asked because you indicated manufacturing, physical products or equipment.",
        showIf: whenAny(
          industryIs("MANUFACTURING"),
          solutionIs("MANUFACTURING_CAPABILITY", "PHYSICAL_PRODUCT", "HARDWARE_EQUIPMENT"),
        ),
        fields: [
          {
            path: "dynamicAnswers.productionCapacity",
            label: "Production capacity",
            type: "textarea",
            rows: 3,
            wide: true,
            hint: "Units per month, tonnes per annum, shifts operated — whichever measure fits.",
          },
          {
            path: "dynamicAnswers.facilities",
            label: "Manufacturing facilities",
            type: "textarea",
            rows: 3,
            wide: true,
            hint: "Locations, floor area, ownership or lease.",
          },
          {
            path: "dynamicAnswers.plantAndEquipment",
            label: "Plant, machinery and equipment",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.materialsSourcing",
            label: "Raw materials and sourcing",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.qualityControl",
            label: "Quality control and testing process",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.localContentPercentage",
            label: "Indigenous / local content (%)",
            type: "number",
            min: 0,
            max: 100,
          },
        ],
      },

      {
        id: "services",
        title: "Service Delivery",
        description: "Asked because you indicated professional or operational services.",
        showIf: whenAny(
          solutionIs("PROFESSIONAL_SERVICES", "OPERATIONAL_SERVICES"),
          industryIs("PROFESSIONAL_SERVICES"),
        ),
        fields: [
          {
            path: "dynamicAnswers.serviceCategories",
            label: "Service categories offered",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.teamQualifications",
            label: "Qualifications and accreditations held by your team",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.engagementModel",
            label: "Engagement model",
            type: "textarea",
            rows: 3,
            wide: true,
            hint: "Fixed-fee, time and materials, outcome-linked, deputation of staff, and so on.",
          },
          {
            path: "dynamicAnswers.concurrentEngagements",
            label: "Engagements you can run concurrently",
            type: "number",
            min: 0,
          },
          {
            path: "dynamicAnswers.serviceLevels",
            label: "Service levels you commit to",
            type: "textarea",
            rows: 3,
            wide: true,
          },
        ],
      },

      {
        id: "software",
        title: "Technology and Digital Delivery",
        description: "Asked because you indicated software or digital solutions.",
        showIf: whenAny(
          solutionIs("SOFTWARE_DIGITAL"),
          industryIs("SOFTWARE_DIGITAL"),
        ),
        fields: [
          {
            path: "dynamicAnswers.technologyStack",
            label: "Technology stack",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.deploymentModel",
            label: "Deployment model",
            type: "multiselect",
            wide: true,
            options: [
              { value: "ON_PREMISE", label: "On-premise" },
              { value: "GOVERNMENT_CLOUD", label: "Government cloud (MeitY empanelled)" },
              { value: "PUBLIC_CLOUD", label: "Public cloud" },
              { value: "HYBRID", label: "Hybrid" },
              { value: "OFFLINE_CAPABLE", label: "Offline-capable / edge" },
            ],
          },
          {
            path: "dynamicAnswers.integrations",
            label: "Integrations and interoperability",
            type: "textarea",
            rows: 3,
            wide: true,
            hint: "APIs, data standards, existing government systems you have integrated with.",
          },
          {
            path: "dynamicAnswers.dataSecurity",
            label: "Data security and privacy measures",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.accessibilityCompliance",
            label: "Accessibility and language support",
            type: "textarea",
            rows: 2,
            wide: true,
            hint: "GIGW compliance, WCAG level, Indian language coverage.",
          },
        ],
      },

      {
        id: "agriculture",
        title: "Agricultural and Environmental Operations",
        description: "Asked because you indicated agriculture, environment or sustainability work.",
        showIf: whenAny(
          industryIs("AGRICULTURE", "SUSTAINABILITY"),
          solutionIs("AGRI_ENVIRONMENTAL"),
        ),
        fields: [
          {
            path: "dynamicAnswers.cropsOrDomains",
            label: "Crops, species or environmental domains covered",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.fieldDeployment",
            label: "Field deployment capability",
            type: "textarea",
            rows: 3,
            wide: true,
            hint: "Field teams, extension workers, demonstration plots, farmer outreach.",
          },
          {
            path: "dynamicAnswers.agriEquipment",
            label: "Equipment and inputs used",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.operationalRegions",
            label: "Agro-climatic zones or regions of operation",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.seasonality",
            label: "Seasonal constraints",
            type: "textarea",
            rows: 2,
            wide: true,
          },
        ],
      },

      {
        id: "construction",
        title: "Construction and Infrastructure Execution",
        description: "Asked because you indicated construction or infrastructure work.",
        showIf: whenAny(
          industryIs("CONSTRUCTION", "INFRASTRUCTURE"),
          solutionIs("INFRASTRUCTURE_CONSTRUCTION"),
        ),
        fields: [
          {
            path: "dynamicAnswers.contractorClass",
            label: "Contractor registration class",
            type: "text",
            hint: "e.g. PWD Class I, CPWD registration, state licensing class.",
          },
          {
            path: "dynamicAnswers.projectTypesExecuted",
            label: "Types of works executed",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.plantAndMachinery",
            label: "Plant and machinery owned",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.labourStrength",
            label: "Skilled and unskilled labour strength",
            type: "text",
          },
          {
            path: "dynamicAnswers.safetyRecord",
            label: "Safety practices and record",
            type: "textarea",
            rows: 3,
            wide: true,
          },
        ],
      },

      {
        id: "hardware",
        title: "Hardware and Equipment Support",
        description: "Asked because you supply hardware, equipment or instrumentation.",
        showIf: whenAny(
          industryIs("HARDWARE_ELECTRONICS"),
          solutionIs("HARDWARE_EQUIPMENT"),
        ),
        fields: [
          {
            path: "dynamicAnswers.componentSourcing",
            label: "Component sourcing and supply chain",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.afterSalesSupport",
            label: "After-sales support and spares availability",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.warrantyTerms",
            label: "Standard warranty terms",
            type: "text",
          },
          {
            path: "dynamicAnswers.installationSupport",
            label: "Installation and commissioning support",
            type: "textarea",
            rows: 2,
            wide: true,
          },
        ],
      },

      {
        id: "healthcare",
        title: "Healthcare and Regulatory",
        description: "Asked because you indicated healthcare or life sciences.",
        showIf: whenAny(industryIs("HEALTHCARE")),
        fields: [
          {
            path: "dynamicAnswers.regulatoryApprovals",
            label: "Regulatory approvals held",
            type: "tags",
            wide: true,
            hint: "CDSCO, FSSAI, NABL, NABH, state drug licence, and so on.",
          },
          {
            path: "dynamicAnswers.clinicalValidation",
            label: "Clinical validation or field evidence",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.coldChainCapability",
            label: "Cold chain and handling capability",
            type: "textarea",
            rows: 2,
            wide: true,
          },
        ],
      },

      {
        id: "logistics",
        title: "Logistics and Distribution",
        description: "Asked because you indicated logistics or supply chain work.",
        showIf: whenAny(industryIs("LOGISTICS")),
        fields: [
          { path: "dynamicAnswers.fleetSize", label: "Fleet size", type: "text" },
          {
            path: "dynamicAnswers.warehouseCapacity",
            label: "Warehousing capacity",
            type: "text",
          },
          {
            path: "dynamicAnswers.distributionNetwork",
            label: "Distribution network",
            type: "textarea",
            rows: 3,
            wide: true,
          },
        ],
      },

      {
        id: "education",
        title: "Education and Training Delivery",
        description: "Asked because you indicated education, skilling or training.",
        showIf: whenAny(
          industryIs("EDUCATION"),
          solutionIs("TRAINING_CAPACITY_BUILDING"),
        ),
        fields: [
          {
            path: "dynamicAnswers.learnerReach",
            label: "Learners trained to date",
            type: "text",
          },
          {
            path: "dynamicAnswers.curriculumAlignment",
            label: "Curriculum and framework alignment",
            type: "textarea",
            rows: 3,
            wide: true,
            hint: "NCERT, NSQF, NCVET, state board alignment, and so on.",
          },
          { path: "dynamicAnswers.trainerPool", label: "Trainer pool size", type: "text" },
          {
            path: "dynamicAnswers.languagesSupported",
            label: "Languages of delivery",
            type: "tags",
            wide: true,
          },
        ],
      },

      {
        id: "research",
        title: "Research and Laboratory Capability",
        description: "Asked because you indicated research, innovation or laboratory work.",
        showIf: whenAny(
          industryIs("RESEARCH_INNOVATION"),
          solutionIs("RESEARCH_INNOVATION"),
        ),
        fields: [
          {
            path: "dynamicAnswers.researchFacilities",
            label: "Research and testing facilities",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.accreditations",
            label: "Laboratory accreditations",
            type: "tags",
            wide: true,
          },
          {
            path: "dynamicAnswers.publications",
            label: "Publications, trials or technical reports",
            type: "textarea",
            rows: 3,
            wide: true,
          },
          {
            path: "dynamicAnswers.researchCollaborations",
            label: "Institutional collaborations",
            type: "textarea",
            rows: 2,
            wide: true,
          },
        ],
      },

      {
        id: "sustainability",
        title: "Environmental Impact Measurement",
        description: "Asked because you indicated sustainability or climate work.",
        showIf: whenAny(industryIs("SUSTAINABILITY")),
        fields: [
          {
            path: "dynamicAnswers.impactMetrics",
            label: "Impact metrics you measure",
            type: "tags",
            wide: true,
            hint: "e.g. tonnes CO2e avoided, kilolitres water saved, tonnes waste diverted",
          },
          {
            path: "dynamicAnswers.measurementMethodology",
            label: "Measurement and verification methodology",
            type: "textarea",
            rows: 3,
            wide: true,
          },
        ],
      },
    ],
  },

  {
    id: "experience",
    title: "Experience and Past Performance",
    shortTitle: "Experience",
    description:
      "Work you have already delivered. Government buyers weigh demonstrated delivery heavily, and an empty record here is the most common reason a capable supplier is passed over.",
    weight: 14,
    collections: ["experience", "credentials"],
    groups: [
      {
        id: "history",
        title: "Public Sector Track Record",
        fields: [
          {
            path: "governmentExperience",
            label: "Government experience",
            type: "select",
            required: true,
            options: GOVERNMENT_EXPERIENCE,
          },
          {
            path: "gemRegistered",
            label: "Registered as a seller on GeM",
            type: "boolean",
          },
          {
            path: "pastTenderExperience",
            label: "Past tender and procurement experience",
            type: "textarea",
            rows: 4,
            maxLength: 3000,
            wide: true,
            hint: "Tenders bid for or won, empanelments held, rate contracts in force.",
          },
          {
            path: "portfolioUrl",
            label: "Portfolio or case-study link",
            type: "url",
            wide: true,
          },
        ],
      },
    ],
  },

  {
    id: "compliance",
    title: "Compliance and Verification",
    shortTitle: "Compliance",
    description:
      "Upload the documents that substantiate what you have declared. Each document is reviewed by the portal administration and carries its own verification status.",
    weight: 8,
    collections: ["documents"],
    groups: [],
  },

  {
    id: "innovation",
    title: "Innovation Profile",
    shortTitle: "Innovation",
    description:
      "Where your solution stands, and what is genuinely new about it. This step is what allows an emerging solution to be surfaced alongside established suppliers.",
    weight: 10,
    groups: [
      {
        id: "maturity",
        title: "Maturity and Readiness",
        fields: [
          {
            path: "solutionNovelty",
            label: "Nature of your solution",
            type: "select",
            required: true,
            options: SOLUTION_NOVELTY,
          },
          {
            path: "innovationStage",
            label: "Current stage",
            type: "select",
            required: true,
            options: INNOVATION_STAGE,
          },
          {
            path: "deploymentReadiness",
            label: "Deployment readiness",
            type: "select",
            options: DEPLOYMENT_READINESS,
          },
        ],
      },
      {
        id: "innovationDetail",
        title: "Innovation and Impact",
        showIf: when("solutionNovelty", "IMPROVED", "INNOVATIVE", "EMERGING"),
        fields: [
          {
            path: "innovationDescription",
            label: "What is new about your approach",
            type: "textarea",
            rows: 5,
            maxLength: 3000,
            wide: true,
          },
          {
            path: "measurableImpact",
            label: "Measurable impact demonstrated so far",
            type: "textarea",
            rows: 4,
            maxLength: 3000,
            wide: true,
            hint: "Numbers where you have them: cost reduction, yield improvement, time saved, people reached.",
          },
        ],
      },
      {
        id: "intellectualProperty",
        title: "Intellectual Property",
        fields: [
          {
            path: "hasIntellectualProperty",
            label: "You hold patents or other registered intellectual property",
            type: "boolean",
            wide: true,
          },
          {
            path: "intellectualPropertyDetails",
            label: "Intellectual property details",
            type: "textarea",
            rows: 3,
            maxLength: 2000,
            wide: true,
            showIf: when("hasIntellectualProperty", "true"),
          },
        ],
      },
    ],
  },
];

export const COLLECTION_DEFINITIONS: Record<
  CollectionId,
  { title: string; description: string; kindOptions?: readonly TaxonomyOption[] }
> = {
  offerings: {
    title: "Products and Services",
    description:
      "List what you actually supply. Each entry is matched independently, so a supplier with three distinct product lines is found for all three.",
    kindOptions: OFFERING_KINDS,
  },
  experience: {
    title: "Previous Projects",
    description:
      "Completed or ongoing work, with the client and the outcome. Government references carry the most weight.",
    kindOptions: CLIENT_TYPES,
  },
  credentials: {
    title: "Certifications, Standards, Awards and IP",
    description:
      "Formal credentials held by the organisation. Attach the supporting document in the Compliance step.",
    kindOptions: CREDENTIAL_KINDS,
  },
  documents: {
    title: "Compliance Documents",
    description:
      "PDF or image files, up to 5 MB each. Documents are visible only to your organisation and to the portal administration.",
    kindOptions: DOCUMENT_TYPES,
  },
};

export function findStep(stepId: string): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((step) => step.id === stepId);
}

export const STEP_IDS: readonly string[] = ONBOARDING_STEPS.map((step) => step.id);
