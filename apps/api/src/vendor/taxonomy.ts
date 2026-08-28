/**
 * The classification vocabulary a vendor profile is built from.
 *
 * This file is the single source of truth. The onboarding form is generated
 * from it (`GET /api/v1/vendor/onboarding-schema`) rather than hard-coded in
 * React, so adding an industry or a solution type changes one file and the
 * portal, the validation and the capability document all follow (D56).
 *
 * Deliberately not technology-centric: a brick manufacturer, a soil-testing
 * laboratory and a mobile-app studio must all find themselves here.
 */

export interface TaxonomyOption {
  value: string;
  label: string;
  /** Shown under the label in the portal where the label alone is ambiguous. */
  hint?: string;
}

export interface IndustryOption extends TaxonomyOption {
  subDomains: readonly string[];
}

export const INDUSTRIES: readonly IndustryOption[] = [
  {
    value: "MANUFACTURING",
    label: "Manufacturing & Industrial Production",
    subDomains: [
      "Heavy engineering",
      "Light engineering & fabrication",
      "Electronics manufacturing",
      "Textiles & apparel",
      "Chemicals & materials",
      "Automotive & components",
      "Packaging",
      "Food processing",
      "Precision machining",
      "Contract manufacturing",
    ],
  },
  {
    value: "AGRICULTURE",
    label: "Agriculture & Allied Activities",
    subDomains: [
      "Crop production inputs",
      "Farm machinery & implements",
      "Irrigation & water management",
      "Post-harvest & cold chain",
      "Soil & crop advisory",
      "Animal husbandry & dairy",
      "Fisheries & aquaculture",
      "Horticulture",
      "Agri-processing",
      "Agri-extension services",
    ],
  },
  {
    value: "CONSTRUCTION",
    label: "Construction & Civil Works",
    subDomains: [
      "Building construction",
      "Roads & highways",
      "Bridges & structures",
      "Water supply & sanitation works",
      "Electrical & plumbing works",
      "Interior & finishing",
      "Prefabricated construction",
      "Structural design & consultancy",
      "Project management consultancy",
    ],
  },
  {
    value: "INFRASTRUCTURE",
    label: "Infrastructure & Public Utilities",
    subDomains: [
      "Power generation & distribution",
      "Renewable energy installations",
      "Water treatment",
      "Waste management",
      "Urban infrastructure",
      "Railways & metro systems",
      "Ports & waterways",
      "Telecommunications infrastructure",
      "Street lighting & smart poles",
    ],
  },
  {
    value: "LOGISTICS",
    label: "Logistics, Transport & Supply Chain",
    subDomains: [
      "Freight & haulage",
      "Warehousing",
      "Cold chain logistics",
      "Last-mile distribution",
      "Fleet operations",
      "Supply chain consulting",
      "Customs & documentation",
      "Passenger transport services",
    ],
  },
  {
    value: "HEALTHCARE",
    label: "Healthcare & Life Sciences",
    subDomains: [
      "Medical devices & equipment",
      "Diagnostics & laboratory services",
      "Pharmaceuticals & formulations",
      "Hospital infrastructure & services",
      "Telemedicine & health delivery",
      "Public health programmes",
      "Biotechnology",
      "Medical consumables",
      "Health data & records systems",
    ],
  },
  {
    value: "EDUCATION",
    label: "Education, Skilling & Training",
    subDomains: [
      "School education services",
      "Higher education services",
      "Vocational skilling",
      "Teacher training",
      "Educational content & curriculum",
      "Laboratory & classroom equipment",
      "Assessment & certification",
      "Digital learning platforms",
    ],
  },
  {
    value: "SUSTAINABILITY",
    label: "Environment, Sustainability & Climate",
    subDomains: [
      "Renewable energy solutions",
      "Energy efficiency & audits",
      "Water conservation",
      "Waste recycling & circular economy",
      "Emissions monitoring",
      "Environmental impact assessment",
      "Afforestation & restoration",
      "Climate resilience planning",
    ],
  },
  {
    value: "HARDWARE_ELECTRONICS",
    label: "Hardware, Electronics & Instrumentation",
    subDomains: [
      "Embedded systems & IoT devices",
      "Sensors & instrumentation",
      "Robotics & automation",
      "Drones & unmanned systems",
      "Communication equipment",
      "Surveillance & security hardware",
      "Test & measurement equipment",
      "Power electronics",
    ],
  },
  {
    value: "SOFTWARE_DIGITAL",
    label: "Software, IT & Digital Services",
    subDomains: [
      "Custom application development",
      "Enterprise & ERP systems",
      "Data platforms & analytics",
      "Artificial intelligence & machine learning",
      "Geospatial & GIS systems",
      "Cybersecurity",
      "Cloud & infrastructure services",
      "Citizen service portals",
      "Systems integration",
    ],
  },
  {
    value: "PROFESSIONAL_SERVICES",
    label: "Professional & Advisory Services",
    subDomains: [
      "Management consulting",
      "Engineering consultancy",
      "Legal & compliance advisory",
      "Audit & assurance",
      "Financial advisory",
      "Survey & data collection",
      "Programme monitoring & evaluation",
      "Design & architecture",
      "Human resources & staffing",
    ],
  },
  {
    value: "RESEARCH_INNOVATION",
    label: "Research, Innovation & Laboratories",
    subDomains: [
      "Applied research & development",
      "Testing & certification laboratories",
      "Materials research",
      "Product prototyping",
      "Academic & institutional research",
      "Technology transfer",
      "Field trials & pilots",
    ],
  },
  {
    value: "DEFENCE_SECURITY",
    label: "Defence, Safety & Security",
    subDomains: [
      "Safety equipment",
      "Security services",
      "Disaster response equipment",
      "Fire safety systems",
      "Surveillance & monitoring services",
      "Protective materials",
    ],
  },
  {
    value: "TOURISM_CULTURE",
    label: "Tourism, Culture & Heritage",
    subDomains: [
      "Heritage conservation",
      "Tourism infrastructure",
      "Event & exhibition services",
      "Handicrafts & artisanal production",
      "Cultural programming",
    ],
  },
  {
    value: "OTHER_INDUSTRY",
    label: "Other industry",
    hint: "Describe the sector in your own words in the following step.",
    subDomains: [],
  },
];

/**
 * Solution types decide which conditional questions a vendor is asked. A vendor
 * may select several — a firm that manufactures a device and operates the
 * service around it is one organisation, not two.
 */
export const SOLUTION_TYPES: readonly TaxonomyOption[] = [
  {
    value: "PHYSICAL_PRODUCT",
    label: "Physical products",
    hint: "Goods supplied as finished items",
  },
  {
    value: "SOFTWARE_DIGITAL",
    label: "Software or digital solutions",
    hint: "Applications, platforms, digital services",
  },
  {
    value: "HARDWARE_EQUIPMENT",
    label: "Hardware or equipment",
    hint: "Machinery, devices, instrumentation",
  },
  {
    value: "MANUFACTURING_CAPABILITY",
    label: "Manufacturing capability",
    hint: "Production capacity offered to others",
  },
  {
    value: "PROFESSIONAL_SERVICES",
    label: "Professional services",
    hint: "Advisory, consultancy, design, audit",
  },
  {
    value: "OPERATIONAL_SERVICES",
    label: "Operational services",
    hint: "Running, maintaining or staffing an operation",
  },
  {
    value: "INFRASTRUCTURE_CONSTRUCTION",
    label: "Infrastructure or construction solutions",
    hint: "Civil works, installation, turnkey builds",
  },
  {
    value: "AGRI_ENVIRONMENTAL",
    label: "Agricultural or environmental solutions",
    hint: "Field, crop, water, waste or climate solutions",
  },
  {
    value: "RESEARCH_INNOVATION",
    label: "Research or innovation",
    hint: "R&D, testing, prototyping, technology transfer",
  },
  {
    value: "TRAINING_CAPACITY_BUILDING",
    label: "Training or capacity building",
    hint: "Skilling, curriculum, institutional strengthening",
  },
  {
    value: "OTHER_SOLUTION",
    label: "Other / custom category",
    hint: "Describe it in your own words",
  },
];

export const ORGANIZATION_TYPES: readonly TaxonomyOption[] = [
  { value: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { value: "PUBLIC_LIMITED", label: "Public Limited Company" },
  { value: "LLP", label: "Limited Liability Partnership" },
  { value: "PARTNERSHIP", label: "Partnership Firm" },
  { value: "PROPRIETORSHIP", label: "Sole Proprietorship" },
  { value: "ONE_PERSON_COMPANY", label: "One Person Company" },
  { value: "COOPERATIVE", label: "Cooperative Society" },
  { value: "SELF_HELP_GROUP", label: "Self-Help Group / Producer Collective" },
  { value: "SOCIETY_TRUST", label: "Society / Trust / Section 8 Company" },
  { value: "ACADEMIC_RESEARCH", label: "Academic or Research Institution" },
  { value: "PUBLIC_SECTOR_UNDERTAKING", label: "Public Sector Undertaking" },
  { value: "OTHER_ENTITY", label: "Other entity type" },
];

export const DELIVERY_MODELS: readonly TaxonomyOption[] = [
  { value: "DIRECT_SUPPLY", label: "Direct supply of goods" },
  { value: "TURNKEY", label: "Turnkey / end-to-end delivery" },
  { value: "ON_SITE_DEPLOYMENT", label: "On-site deployment and installation" },
  { value: "FIELD_OPERATIONS", label: "Field operations and last-mile execution" },
  { value: "MANAGED_SERVICE", label: "Managed service / operate and maintain" },
  { value: "CONSULTING_ENGAGEMENT", label: "Consulting engagement" },
  { value: "REMOTE_DELIVERY", label: "Remote / off-site delivery" },
  { value: "SUBSCRIPTION_LICENCE", label: "Subscription or licence" },
  { value: "PARTNER_CHANNEL", label: "Through partners, dealers or channel network" },
  { value: "TRAINING_PROGRAMME", label: "Training or capacity-building programme" },
];

export const SERVICE_COVERAGE: readonly TaxonomyOption[] = [
  { value: "SINGLE_DISTRICT", label: "Single district" },
  { value: "STATE", label: "State-wide" },
  { value: "MULTI_STATE", label: "Multiple states" },
  { value: "NATIONAL", label: "Pan-India" },
  { value: "INTERNATIONAL", label: "India and international" },
];

export const GOVERNMENT_EXPERIENCE: readonly TaxonomyOption[] = [
  { value: "NONE", label: "No government experience yet" },
  { value: "LOCAL_BODY", label: "Urban local body or panchayat" },
  { value: "STATE", label: "State government departments" },
  { value: "CENTRAL", label: "Central government ministries or departments" },
  { value: "PSU", label: "Public sector undertakings" },
  { value: "MULTIPLE", label: "Across central, state and local bodies" },
];

export const GOVERNMENT_SCALE_READINESS: readonly TaxonomyOption[] = [
  { value: "PILOT_ONLY", label: "Ready for a pilot or limited deployment" },
  { value: "DISTRICT_SCALE", label: "Ready for district-scale delivery" },
  { value: "STATE_SCALE", label: "Ready for state-scale delivery" },
  { value: "NATIONAL_SCALE", label: "Ready for national-scale delivery" },
];

export const SOLUTION_NOVELTY: readonly TaxonomyOption[] = [
  { value: "EXISTING", label: "Established solution already in the market" },
  { value: "IMPROVED", label: "Improvement on an existing approach" },
  { value: "INNOVATIVE", label: "Innovative — materially new approach" },
  { value: "EMERGING", label: "Emerging technology or method, not yet widespread" },
];

export const INNOVATION_STAGE: readonly TaxonomyOption[] = [
  { value: "CONCEPT", label: "Concept or design stage" },
  { value: "PROTOTYPE", label: "Working prototype" },
  { value: "MVP", label: "Minimum viable product / first version" },
  { value: "PILOT", label: "Pilot deployments completed" },
  { value: "PRODUCTION", label: "In production use with paying customers" },
  { value: "SCALED", label: "Deployed at scale across multiple regions" },
];

export const DEPLOYMENT_READINESS: readonly TaxonomyOption[] = [
  { value: "NOT_READY", label: "Not yet ready for deployment" },
  { value: "PILOT_READY", label: "Ready for a supervised pilot" },
  { value: "DEPLOYMENT_READY", label: "Ready for immediate deployment" },
  { value: "SCALE_READY", label: "Ready for large-scale rollout" },
];

export const CLIENT_TYPES: readonly TaxonomyOption[] = [
  { value: "CENTRAL_GOVERNMENT", label: "Central government" },
  { value: "STATE_GOVERNMENT", label: "State government" },
  { value: "PSU", label: "Public sector undertaking" },
  { value: "URBAN_LOCAL_BODY", label: "Urban local body / panchayat" },
  { value: "PRIVATE", label: "Private sector" },
  { value: "NGO", label: "NGO or development agency" },
  { value: "ACADEMIC", label: "Academic or research institution" },
  { value: "INTERNATIONAL", label: "International client" },
];

export const CREDENTIAL_KINDS: readonly TaxonomyOption[] = [
  { value: "CERTIFICATION", label: "Certification" },
  { value: "LICENCE", label: "Licence or permit" },
  { value: "QUALITY_STANDARD", label: "Quality standard" },
  { value: "AWARD", label: "Award or recognition" },
  { value: "INTELLECTUAL_PROPERTY", label: "Patent or intellectual property" },
  { value: "EMPANELMENT", label: "Empanelment or registration" },
];

export const OFFERING_KINDS: readonly TaxonomyOption[] = [
  { value: "PRODUCT", label: "Product" },
  { value: "SERVICE", label: "Service" },
  { value: "CAPABILITY", label: "Capability" },
];

export const DOCUMENT_TYPES: readonly TaxonomyOption[] = [
  { value: "BUSINESS_REGISTRATION", label: "Certificate of incorporation / business registration" },
  { value: "GST_CERTIFICATE", label: "GST registration certificate" },
  { value: "PAN_CARD", label: "PAN card" },
  { value: "UDYAM_MSME", label: "Udyam / MSME registration" },
  { value: "DPIIT_STARTUP", label: "DPIIT startup recognition" },
  { value: "QUALITY_CERTIFICATE", label: "Quality standard certificate (ISO, BIS, etc.)" },
  { value: "TRADE_LICENCE", label: "Trade licence or operating permit" },
  { value: "FACTORY_LICENCE", label: "Factory or manufacturing licence" },
  { value: "SECTOR_LICENCE", label: "Sector-specific licence (drug, food, pollution, etc.)" },
  { value: "FINANCIAL_STATEMENT", label: "Audited financial statement" },
  { value: "WORK_ORDER", label: "Past work order or completion certificate" },
  { value: "PATENT_DOCUMENT", label: "Patent or IP document" },
  { value: "OTHER_DOCUMENT", label: "Other supporting document" },
];

export const ELIGIBILITY_FLAGS: readonly TaxonomyOption[] = [
  { value: "startup", label: "Recognised startup" },
  { value: "msme", label: "MSME (micro, small or medium enterprise)" },
  { value: "dpiitRecognised", label: "DPIIT recognised" },
  { value: "womenLed", label: "Women-led enterprise" },
  { value: "scStOwned", label: "SC/ST owned enterprise" },
  { value: "farmerProducerOrganisation", label: "Farmer Producer Organisation" },
  { value: "selfHelpGroup", label: "Self-help group / collective" },
  { value: "gemRegistered", label: "Registered on GeM" },
  { value: "makeInIndia", label: "Make in India / local content compliant" },
];

export const INDIAN_STATES: readonly string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

function values(options: readonly TaxonomyOption[]): readonly string[] {
  return options.map((option) => option.value);
}

export const INDUSTRY_VALUES = values(INDUSTRIES);
export const SOLUTION_TYPE_VALUES = values(SOLUTION_TYPES);
export const ORGANIZATION_TYPE_VALUES = values(ORGANIZATION_TYPES);
export const DELIVERY_MODEL_VALUES = values(DELIVERY_MODELS);
export const SERVICE_COVERAGE_VALUES = values(SERVICE_COVERAGE);
export const GOVERNMENT_EXPERIENCE_VALUES = values(GOVERNMENT_EXPERIENCE);
export const GOVERNMENT_SCALE_READINESS_VALUES = values(GOVERNMENT_SCALE_READINESS);
export const SOLUTION_NOVELTY_VALUES = values(SOLUTION_NOVELTY);
export const INNOVATION_STAGE_VALUES = values(INNOVATION_STAGE);
export const DEPLOYMENT_READINESS_VALUES = values(DEPLOYMENT_READINESS);
export const DOCUMENT_TYPE_VALUES = values(DOCUMENT_TYPES);
export const CREDENTIAL_KIND_VALUES = values(CREDENTIAL_KINDS);
export const OFFERING_KIND_VALUES = values(OFFERING_KINDS);
export const CLIENT_TYPE_VALUES = values(CLIENT_TYPES);

const LABEL_LOOKUP = new Map<string, string>(
  [
    ...INDUSTRIES,
    ...SOLUTION_TYPES,
    ...ORGANIZATION_TYPES,
    ...DELIVERY_MODELS,
    ...SERVICE_COVERAGE,
    ...GOVERNMENT_EXPERIENCE,
    ...GOVERNMENT_SCALE_READINESS,
    ...SOLUTION_NOVELTY,
    ...INNOVATION_STAGE,
    ...DEPLOYMENT_READINESS,
    ...CLIENT_TYPES,
    ...CREDENTIAL_KINDS,
    ...OFFERING_KINDS,
    ...DOCUMENT_TYPES,
    ...ELIGIBILITY_FLAGS,
  ].map((option) => [option.value, option.label]),
);

/** Falls back to the raw value so an unrecognised code is still readable. */
export function labelFor(value: string): string {
  return LABEL_LOOKUP.get(value) ?? value;
}

export function subDomainsFor(industries: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const industry of INDUSTRIES) {
    if (industries.includes(industry.value)) {
      for (const subDomain of industry.subDomains) {
        seen.add(subDomain);
      }
    }
  }
  return [...seen];
}
