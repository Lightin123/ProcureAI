import type {
  CatalogueCredential,
  CatalogueDocument,
  CatalogueExperience,
  CatalogueOffering,
} from "./types.js";

/**
 * Completing the original demonstration suppliers without replacing them.
 *
 * The eight suppliers in `seedVendors.ts` were written to span the sectors the
 * platform claims to serve, and their capability prose is what the semantic
 * matching was originally tuned against. Rewriting them to reach 100%
 * completion would have thrown that away, so this file adds only what the
 * onboarding schema found missing: the identifiers, the address and contact
 * fields, the conditional questions their own classification asks them, and the
 * compliance documents they never had.
 *
 * Each entry is merged over the original profile — `profile` is a partial patch,
 * not a replacement — so the sector, the narrative and the deliberate
 * peculiarities of each supplier survive untouched. `VND-URJA-SAHKAR` still
 * describes itself in the vocabulary that exists to prove semantic retrieval
 * beats keyword matching, and `VND-DEMO` keeps its identity while being
 * completed like every other supplier.
 *
 * Everything here is fictional, as in the rest of the catalogue.
 */

export interface ExistingVendorUpgrade {
  /** Merged over the seeded profile, key by key; nested objects merge too. */
  profile: Record<string, unknown>;
  documents: CatalogueDocument[];
  verificationNotes: string;
  matchingRole: string;
  /**
   * Supplied only where the seeded supplier has none of its own. Where the
   * original already carries a collection it is used unchanged, because those
   * entries are part of the demonstration content this file exists to preserve.
   */
  offerings?: CatalogueOffering[];
  experience?: CatalogueExperience[];
  credentials?: CatalogueCredential[];
}

const registrationDocument = (reference: string, issuedOn: string): CatalogueDocument => ({
  documentType: "BUSINESS_REGISTRATION",
  title: "Certificate of registration",
  referenceNumber: reference,
  issuedOn,
  validUntil: null,
  body: [
    "Stands in for the registration certificate of the demonstration entity named above.",
    "The entity and the identifier are fictional and correspond to no real registration.",
  ],
});

const gstDocument = (reference: string): CatalogueDocument => ({
  documentType: "GST_CERTIFICATE",
  title: "GST registration certificate",
  referenceNumber: reference,
  issuedOn: "2017-07-01",
  validUntil: null,
  body: [
    "Stands in for a goods and services tax registration certificate.",
    "The registration number is synthetic and is not issued to any real taxpayer.",
  ],
});

export const EXISTING_VENDOR_UPGRADES: Readonly<Record<string, ExistingVendorUpgrade>> = {
  "VND-BHARAT-FAB": {
    matchingRole:
      "Precision sheet-metal fabricator. The original demonstration supplier for build-to-print manufacturing; strong for enclosure and fabricated assembly packages.",
    verificationNotes:
      "Incorporation, GST, Udyam and the ISO 9001 certificate were checked against the declared particulars.",
    profile: {
      identifiers: {
        cin: "U28910TN2009PTC073412",
        dpiit: "Not DPIIT recognised",
        gemSellerId: "GEM-SLR-TN-734128",
      },
      authorisedRepresentative: { phone: "+91 44 2625 8801" },
      portfolioUrl: "https://bharatprecision.example.in/works",
    },
    documents: [
      registrationDocument("U28910TN2009PTC073412", "2009-03-18"),
      gstDocument("33AABCB1234M1Z5"),
      {
        documentType: "FACTORY_LICENCE",
        title: "Factory licence",
        referenceNumber: "FAC-DEMO-TN-73412",
        issuedOn: "2021-02-15",
        validUntil: "2026-02-14",
        body: [
          "Stands in for a factory licence for a sheet-metal fabrication works.",
          "Sanctioned strength and endorsements shown are illustrative.",
        ],
      },
    ],
  },

  "VND-SAHYADRI-AGRI": {
    matchingRole:
      "Farmer producer company supplying fresh produce. The original demonstration supplier for institutional food supply; retains its role as the intended match for the vegetable supply package.",
    verificationNotes:
      "Producer company registration, GST, FSSAI licence and the grading facility record were checked.",
    profile: {
      identifiers: {
        cin: "PC-DEMO-MH-2016-0221",
        dpiit: "Not DPIIT recognised",
        gemSellerId: "GEM-SLR-MH-022147",
      },
      registeredAddress: { line2: "Near Agricultural Produce Market Committee Yard" },
      authorisedRepresentative: { phone: "+91 2426 224 118" },
      portfolioUrl: "https://sahyadrifarms.example.in/institutional-supply",
      dynamicAnswers: {
        productionCapacity:
          "About 190 tonnes of graded produce a week from member farms, with a 60-tonne pre-cooling chamber and a 140-tonne cold room at the aggregation centre.",
        facilities:
          "Two aggregation and grading centres with washing, grading and packing halls, pre-cooling and cold storage, and a crate washing line.",
        plantAndEquipment: [
          "Grading and sorting tables",
          "60-tonne pre-cooling chamber",
          "140-tonne cold room",
          "Refrigerated and insulated delivery vehicles",
          "Platform weighing scales",
          "Crate washing line",
        ],
        materialsSourcing:
          "All produce is procured from member farmers against a published daily price; no open-market purchase is made under an institutional contract.",
        qualityControl:
          "Produce is graded against the buyer's written specification before packing, and each lot is checked for size, damage and foreign matter before the crate is sealed.",
        localContentPercentage: 100,
        serviceCategories: [
          "Institutional fresh produce supply",
          "Aggregation and grading",
          "Cold chain first mile",
          "Scheduled delivery operations",
        ],
        teamQualifications:
          "Three horticulture graduates, six trained field officers and a food safety supervisor with FSSAI training.",
        engagementModel:
          "Seasonal or annual supply contracts with a fixed delivery calendar and a written grade specification agreed before the first despatch.",
        concurrentEngagements: 5,
        serviceLevels:
          "Delivery within a contracted two-hour window, 98% schedule adherence, and replacement of a rejected lot within four hours.",
        fleetSize:
          "Nine refrigerated and insulated vehicles from 1.5 to 5 tonnes running scheduled morning routes.",
        warehouseCapacity:
          "A 140-tonne cold room and 400 square metres of ambient packing and staging area across two centres.",
        distributionNetwork:
          "Two aggregation centres serving institutional kitchens across four districts on fixed morning routes.",
        learnerReach:
          "About 1,900 member farmers reached each season through grading and post-harvest handling training.",
        curriculumAlignment:
          "Farmer training follows the state horticulture mission's post-harvest handling curriculum, with modules on grading, crate handling and cold chain discipline.",
        trainerPool:
          "Six trained field officers who deliver farmer training alongside their procurement duties.",
        languagesSupported: ["Marathi", "Hindi", "English"],
      },
    },
    documents: [
      registrationDocument("PC-DEMO-MH-2016-0221", "2016-07-12"),
      gstDocument("27AAKCS1122L1ZP"),
      {
        documentType: "SECTOR_LICENCE",
        title: "FSSAI food business operator licence",
        referenceNumber: "FSSAI-DEMO-10022147",
        issuedOn: "2022-05-18",
        validUntil: "2027-05-17",
        body: [
          "Stands in for a food business operator licence covering aggregation, grading and distribution of fresh produce.",
          "Scope and conditions shown are illustrative.",
        ],
      },
    ],
  },

  "VND-KAVERI-INFRA": {
    matchingRole:
      "Road and civil works contractor. The original demonstration supplier for infrastructure construction; the intended match for the inter-village road package.",
    verificationNotes:
      "Incorporation, GST, Class A contractor registration and the ISO 9001 certificate were checked.",
    profile: {
      website: "https://kaveriinfra.example.in",
      identifiers: {
        cin: "U45201KA2007PTC044190",
        dpiit: "Not DPIIT recognised",
        gemSellerId: "GEM-SLR-KA-441907",
      },
      registeredAddress: { line2: "Near Public Works Department Division Office" },
      authorisedRepresentative: { phone: "+91 821 244 7710" },
      portfolioUrl: "https://kaveriinfra.example.in/completed-works",
      dynamicAnswers: {
        serviceCategories: [
          "Road construction and rehabilitation",
          "Cross-drainage works",
          "Bridge and culvert construction",
          "Routine road maintenance",
        ],
        teamQualifications:
          "Thirty-four graduate and diploma engineers, two quality control engineers running the site laboratory, and a contracts team experienced in departmental measurement and billing.",
        engagementModel:
          "Item-rate civil works contracts with departmental measurement, and multi-year routine maintenance taken as a separate scope.",
        concurrentEngagements: 6,
        serviceLevels:
          "Layer test results recorded before the next layer is laid, monthly progress against an agreed programme, and defect rectification within the contractual liability period at our own cost.",
      },
    },
    documents: [
      registrationDocument("U45201KA2007PTC044190", "2007-05-24"),
      gstDocument("29AAECK4419N1ZT"),
      {
        documentType: "OTHER_DOCUMENT",
        title: "Contractor registration certificate",
        referenceNumber: "CTR-DEMO-KA-A-4419",
        issuedOn: "2022-03-15",
        validUntil: "2027-03-14",
        body: [
          "Stands in for a contractor registration certificate issued by a public works department.",
          "Class and financial limits shown are illustrative.",
        ],
      },
    ],
  },

  "VND-AAROGYA-DX": {
    matchingRole:
      "Diagnostics device manufacturer. The original demonstration supplier for healthcare manufacturing; strong for medical device packages and a test of regulatory credential checking.",
    verificationNotes:
      "Incorporation, GST, the medical device manufacturing licence and ISO 13485 were checked.",
    profile: {
      identifiers: {
        cin: "U33110KA2015PTC078812",
        gemSellerId: "GEM-SLR-KA-788124",
      },
      registeredAddress: { line2: "Electronic City Phase I" },
      authorisedRepresentative: { phone: "+91 80 2852 4417" },
      portfolioUrl: "https://aarogyadx.example.in/products",
      dynamicAnswers: {
        productionCapacity:
          "About 9,000 diagnostic devices and 1.4 million test strips a year across two assembly lines.",
        facilities:
          "A single works with electronics assembly, a controlled environment strip production area, a calibration laboratory and finished goods storage.",
        plantAndEquipment: [
          "Surface mount assembly and reflow line",
          "Strip coating and cutting line",
          "Environmental test chamber",
          "Calibration laboratory instruments",
          "Automated optical inspection",
        ],
        materialsSourcing:
          "Reagents, membranes and electronic components are bought from six qualified suppliers under annual quality agreements with lot traceability on every incoming batch.",
        qualityControl:
          "Every device is calibrated against reference material with the record stored under its serial number, and each strip lot is released against a reference panel.",
        localContentPercentage: 68,
        serviceCategories: [
          "Point-of-care device supply",
          "Reagent and consumable supply",
          "Installation and user training",
          "Calibration and preventive maintenance",
        ],
        teamQualifications:
          "Eleven biomedical and electronics engineers, four regulatory affairs specialists and six field application specialists who train laboratory and field staff.",
        engagementModel:
          "Equipment supply with a linked consumable rate contract, or a reagent-rental model where the department pays per test rather than for the instrument.",
        concurrentEngagements: 8,
        serviceLevels:
          "Fault attendance within 72 hours in the covered states, calibration at six-monthly intervals, and consumable despatch within seven days of an indent.",
      },
    },
    documents: [
      registrationDocument("U33110KA2015PTC078812", "2015-09-08"),
      gstDocument("29AAFCA7788M1ZK"),
      {
        documentType: "SECTOR_LICENCE",
        title: "Medical device manufacturing licence",
        referenceNumber: "MD-DEMO-KA-7881",
        issuedOn: "2022-01-25",
        validUntil: "2027-01-24",
        body: [
          "Stands in for a medical device manufacturing licence.",
          "Device classes and scope shown are illustrative.",
        ],
      },
    ],
  },

  "VND-PRAGATI-SKILL": {
    matchingRole:
      "Skilling and training institute. The original demonstration supplier for education and capacity building; the intended match for the skill development package.",
    verificationNotes:
      "Society registration, GST, the training partner affiliation and the sector skill council accreditation were checked.",
    profile: {
      website: "https://pragatiskill.example.in",
      identifiers: {
        cin: "SOC-DEMO-UP-2013-0771",
        udyam: "UDYAM-UP-31-0077120",
        dpiit: "Not DPIIT recognised",
        gemSellerId: "GEM-SLR-UP-771204",
      },
      registeredAddress: { line2: "Near District Industries Centre" },
      authorisedRepresentative: { phone: "+91 512 255 4417" },
      portfolioUrl: "https://pragatiskill.example.in/programmes",
    },
    documents: [
      registrationDocument("SOC-DEMO-UP-2013-0771", "2013-08-19"),
      gstDocument("09AAATP7712R1ZN"),
      {
        documentType: "OTHER_DOCUMENT",
        title: "Training partner affiliation certificate",
        referenceNumber: "TP-DEMO-0771",
        issuedOn: "2021-05-11",
        validUntil: "2026-05-10",
        body: [
          "Stands in for a training partner affiliation certificate.",
          "Job roles and sector councils shown are illustrative.",
        ],
      },
    ],
  },

  "VND-PUNARCHAKRA": {
    matchingRole:
      "Waste recovery and recycling enterprise. The original demonstration supplier for circular economy work; the intended match for the ward-level waste infrastructure package.",
    verificationNotes:
      "Incorporation, GST, the pollution control board consent and the recycler registration were checked.",
    profile: {
      website: "https://punarchakra.example.in",
      identifiers: {
        cin: "U90002MH2018PTC099120",
        udyam: "UDYAM-MH-18-0099124",
        gemSellerId: "GEM-SLR-MH-991248",
      },
      registeredAddress: { line2: "Behind the Municipal Transfer Station" },
      authorisedRepresentative: { phone: "+91 20 2445 7716" },
      pastTenderExperience:
        "We have held ward-level waste collection and processing contracts with two municipal corporations and a cantonment board since 2019, and a material recovery facility operations contract since 2021.",
      portfolioUrl: "https://punarchakra.example.in/operations",
      dynamicAnswers: {
        plantAndEquipment: [
          "Trommel screen",
          "Shredder",
          "Windrow turner",
          "Baling press",
          "Front-end loader",
          "Weighbridge",
        ],
        materialsSourcing:
          "Feedstock is the segregated municipal stream we collect ourselves; recyclables are sold to registered recyclers under documented purchase orders.",
        localContentPercentage: 100,
        serviceCategories: [
          "Segregated collection",
          "Ward-level composting",
          "Material recovery and grading",
          "Household segregation programmes",
        ],
        teamQualifications:
          "Four environmental engineers, two community mobilisation specialists and eleven trained facility supervisors.",
        engagementModel:
          "Multi-year operations contracts priced per tonne processed, with a household segregation performance obligation written into the scope.",
        concurrentEngagements: 4,
        serviceLevels:
          "Daily collection coverage of at least 98% of scheduled households, compost meeting fertiliser control order parameters on monthly testing, and residue to landfill held below the contracted fraction.",
        agriEquipment: [
          "Compost moisture and temperature probes",
          "Windrow turner",
          "Screening units",
          "Weighing scales",
        ],
        seasonality:
          "Organic tonnage rises through the festival season and the monsoon raises windrow moisture, which is managed with covered platforms and a shorter turning interval.",
        contractorClass:
          "Registered contractor for solid waste management works with two municipal corporations; civil construction of ward facilities is subcontracted to a registered civil contractor under our supervision.",
        projectTypesExecuted: [
          "Ward composting facility construction",
          "Material recovery facility operation",
          "Segregated collection route establishment",
          "Legacy waste characterisation studies",
        ],
        plantAndMachinery:
          "Collection vehicles, a trommel screen, a shredder, a windrow turner, a baling press and a front-end loader, with civil plant hired per project.",
        labourStrength:
          "About 180 collection and sorting workers engaged directly rather than through labour contractors, with eleven supervisors and four facility managers.",
        safetyRecord:
          "No fatality and three minor reportable injuries in four years, all in sorting. Every sorting worker is issued cut-resistant gloves and boots and receives an annual health check.",
      },
    },
    documents: [
      registrationDocument("U90002MH2018PTC099120", "2018-04-16"),
      gstDocument("27AAECP9912K1ZB"),
      {
        documentType: "SECTOR_LICENCE",
        title: "Pollution control board consent to operate",
        referenceNumber: "CTO-DEMO-MH-9912",
        issuedOn: "2022-08-08",
        validUntil: "2027-08-07",
        body: [
          "Stands in for a consent to operate for a waste processing facility.",
          "Categories, capacities and conditions shown are illustrative.",
        ],
      },
    ],
  },

  "VND-URJA-SAHKAR": {
    matchingRole:
      "Rural energy cooperative. Present specifically to demonstrate what semantic retrieval adds: it does the work the solar street lighting package describes but in its own vocabulary. Its wording is unchanged by this upgrade.",
    verificationNotes:
      "Cooperative society registration, GST, the renewable energy channel partner empanelment and the electrical contractor licence were checked.",
    profile: {
      identifiers: {
        cin: "COOP-DEMO-RJ-2014-0331",
        dpiit: "Not DPIIT recognised",
        gemSellerId: "GEM-SLR-RJ-033124",
      },
      registeredAddress: { line2: "Near the Panchayat Samiti Office" },
      authorisedRepresentative: { phone: "+91 141 262 4416" },
      portfolioUrl: "https://urjasahkar.example.in/installations",
      dynamicAnswers: {
        plantAndEquipment: [
          "Luminaire and controller assembly benches",
          "Battery capacity test rig",
          "Photometric test bench",
          "Pole erection equipment",
          "Portable IV curve tracer",
        ],
        materialsSourcing:
          "Modules, batteries, controllers and luminaires are bought from five qualified domestic suppliers with lot certificates; nothing is bought on the open market for a programme installation.",
        qualityControl:
          "Every assembled system is burnt in and photometrically checked before despatch, and battery capacity is verified on a sample from each incoming lot.",
        localContentPercentage: 72,
        serviceCategories: [
          "Decentralised renewable installation",
          "Operation and maintenance",
          "Community energy committee training",
          "Battery lifecycle management",
        ],
        teamQualifications:
          "Nine diploma engineers, twenty-two trained installation technicians and four community mobilisers who train village energy committees.",
        engagementModel:
          "Installation contracts bundled with a five-year maintenance obligation measured on installations still operating, with a village energy committee trained at handover.",
        concurrentEngagements: 5,
        serviceLevels:
          "Fault attendance within 72 hours in the covered blocks, a quarterly operating-asset report to the commissioning body, and battery replacement within the contracted lifecycle at our cost.",
        cropsOrDomains: [
          "Habitation lighting beyond the distribution network",
          "Solar drinking water pumping",
          "Community building electrification",
          "Agricultural pumping",
        ],
        agriEquipment: [
          "Solar pumping controllers",
          "Submersible solar pump sets",
          "Module cleaning equipment",
          "Portable irradiance meters",
        ],
        seasonality:
          "Installation runs from October to May; the monsoon months are used for maintenance rounds, module cleaning and battery replacement cycles.",
        contractorClass:
          "Class B electrical contractor licence for LT installation work, with renewable energy channel partner empanelment in the state.",
        projectTypesExecuted: [
          "Decentralised habitation lighting",
          "Solar pumping installations",
          "Community building electrification",
          "Battery bank replacement programmes",
        ],
        plantAndMachinery:
          "Four crew vehicles with mounted winches, two hydraulic pole erection units, cable pulling equipment and portable generators for site work.",
        labourStrength:
          "About 96 field personnel across six installation crews, including licensed electricians, technicians and helpers drawn from the habitations we work in.",
        safetyRecord:
          "No reportable lost-time injury in five years. Work at height is done under a documented harness procedure with daily inspection recorded in the crew log.",
      },
    },
    documents: [
      registrationDocument("COOP-DEMO-RJ-2014-0331", "2014-02-27"),
      gstDocument("08AAAAU3312P1ZL"),
      {
        documentType: "OTHER_DOCUMENT",
        title: "Renewable energy channel partner empanelment",
        referenceNumber: "REC-DEMO-RJ-0331",
        issuedOn: "2021-11-30",
        validUntil: "2026-11-29",
        body: [
          "Stands in for a channel partner empanelment certificate issued by a renewable energy agency.",
          "Categories and limits shown are illustrative.",
        ],
      },
    ],
  },

  /**
   * The original demonstration account was left deliberately empty so the
   * onboarding questionnaire could be shown working on an incomplete record.
   * It is completed here because the dataset requires every supplier to be
   * fully onboarded and verified; a fresh registration through `/register`
   * still produces an empty profile for that demonstration.
   *
   * Its identity, sector and location are preserved.
   */
  "VND-DEMO": {
    matchingRole:
      "Small software firm. Formerly the deliberately empty onboarding demonstration account; now completed like every other supplier, and a modest match for digital packages.",
    verificationNotes:
      "Incorporation, GST, Udyam and the ISO 27001 certificate were checked against the declared particulars.",
    profile: {
      registrationNumber: "U72900KL2018PTC055120",
      website: "https://demovendorsolutions.example.in",
      identifiers: {
        gstin: "32AAECD5512N1ZQ",
        pan: "AAECD5512N",
        cin: "U72900KL2018PTC055120",
        udyam: "UDYAM-KL-07-0055124",
        dpiit: "Not DPIIT recognised",
        gemSellerId: "GEM-SLR-KL-551247",
      },
      eligibility: { flags: ["msme", "makeInIndia", "gemRegistered"], msmeCategory: "MICRO" },
      registeredAddress: {
        line1: "Second Floor, Infopark Technology Business Centre",
        line2: "Kakkanad",
        city: "Kochi",
        district: "Ernakulam",
        state: "Kerala",
        pincode: "682042",
      },
      primaryContact: {
        name: "S. Nair",
        designation: "Managing Director",
        email: "vendor@procureai.local",
        phone: "+91 484 240 1180",
      },
      authorisedRepresentative: {
        name: "S. Nair",
        designation: "Managing Director",
        email: "vendor@procureai.local",
        phone: "+91 484 240 1180",
      },
      subDomains: ["Custom application development", "Citizen service portals", "Data platforms & analytics"],
      solutionTypes: ["SOFTWARE_DIGITAL", "PROFESSIONAL_SERVICES"],
      problemBeingSolved:
        "Small local bodies cannot afford a full departmental system and end up with spreadsheets that nobody can audit, so a panchayat's own records cannot answer a simple question about its own assets.",
      coreCapabilities: [
        "Custom web application development",
        "Panchayat and small local body systems",
        "Data migration from spreadsheets and legacy records",
        "Reporting and dashboard development",
        "Application maintenance and support",
      ],
      expertiseAreas: ["Local body software", "Data migration", "Small-team agile delivery"],
      problemDomains: [
        "Unauditable spreadsheet records in small local bodies",
        "Systems too large and costly for a panchayat",
        "Lost institutional records at staff transitions",
      ],
      sectorsServed: ["Panchayati raj", "Urban local bodies", "Small departments", "Cooperative societies"],
      targetCustomers: ["Gram panchayats", "Municipal councils", "District administrations", "Cooperative federations"],
      differentiators:
        "We build small systems for small bodies and price them accordingly, and we hand over the source and the data in an open format at the end so the client is never locked in.",
      valueProposition:
        "A panchayat or municipal council gets a system sized and priced for it, with its own data returned in an open format whenever it asks.",
      deliveryModels: ["REMOTE_DELIVERY", "CONSULTING_ENGAGEMENT", "SUBSCRIPTION_LICENCE"],
      serviceCoverage: "STATE",
      coverageNotes:
        "We work across Kerala, mostly remotely with occasional visits for requirement workshops and handover training.",
      teamSize: 14,
      domainExpertise: ["Web application development", "Local body processes", "Data migration"],
      deliveryCapability:
        "About three concurrent development engagements with a team of fourteen, plus support on eleven live systems.",
      capacityNotes:
        "Development capacity is small by choice; we take on what fourteen people can supervise properly rather than subcontracting.",
      scalabilityNotes:
        "We can add about four developers a year without losing the review discipline the small-team model depends on.",
      infrastructureNotes:
        "A Kochi office with a development team, hosting on government cloud for client systems, and a version-controlled handover repository for every client.",
      governmentScaleReadiness: "DISTRICT_SCALE",
      minProjectValueInr: 100000,
      typicalProjectValueInr: 1800000,
      maxProjectValueInr: 9000000,
      governmentExperience: "LOCAL_BODY",
      gemRegistered: true,
      pastTenderExperience:
        "We have built asset register and grievance systems for four gram panchayats and two municipal councils since 2020, all through direct engagement rather than competitive tender.",
      portfolioUrl: "https://demovendorsolutions.example.in/work",
      solutionNovelty: "EXISTING",
      innovationStage: "PRODUCTION",
      deploymentReadiness: "DEPLOYMENT_READY",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        technologyStack: ["TypeScript and React", "Node.js", "PostgreSQL", "Docker"],
        deploymentModel: ["GOVERNMENT_CLOUD", "PUBLIC_CLOUD"],
        integrations:
          "Systems integrate with state payment gateways and the panchayat accounting system through documented interfaces, and export data in open formats on request.",
        dataSecurity:
          "Client systems run on government cloud with role-based access and audit logging; we hold no client data outside the client's own environment.",
        accessibilityCompliance:
          "Interfaces are built to the national accessibility guidelines for government websites, with keyboard navigation and screen reader support checked before release.",
        serviceCategories: [
          "Custom application development",
          "Data migration",
          "Application support",
          "Requirement workshops and training",
        ],
        teamQualifications:
          "Nine developers, two designers, a data migration specialist and two engagement leads with local body experience.",
        engagementModel:
          "Fixed-scope development for small systems, followed by an annual support subscription, with source and data handed over in an open format at the end of every engagement.",
        concurrentEngagements: 3,
        serviceLevels:
          "Support response within one working day, quarterly releases on supported systems, and a data export delivered within five working days of any client request.",
      },
    },
    offerings: [
      {
        kind: "SERVICE",
        name: "Asset register and works tracking for small local bodies",
        description:
          "A web application for a gram panchayat or municipal council to record its assets, works and expenditure, migrated from whatever spreadsheets and registers it currently keeps, with the data exportable in an open format at any time.",
        categories: ["Local body software", "Custom application"],
        tags: ["asset register", "panchayat", "works tracking", "data migration", "open export"],
        sectors: ["Panchayati raj", "Urban local bodies"],
      },
      {
        kind: "SERVICE",
        name: "Grievance and service request tracking",
        description:
          "A small grievance and service request system for local bodies, with ward-level routing, escalation reminders and a monthly summary the council can read without training.",
        categories: ["Grievance systems", "Custom application"],
        tags: ["grievance", "service request", "ward routing", "escalation"],
        sectors: ["Urban local bodies", "Panchayati raj"],
      },
      {
        kind: "SERVICE",
        name: "Data migration and record recovery",
        description:
          "Migration of spreadsheets, paper registers and legacy databases into a structured record a local body can query, including reconciliation of duplicate and conflicting entries.",
        categories: ["Data migration", "Records management"],
        tags: ["data migration", "record recovery", "reconciliation", "legacy records"],
        sectors: ["Local bodies", "Cooperative societies"],
      },
    ],
    experience: [
      {
        title: "Asset register for four gram panchayats",
        clientName: "Block Panchayat Office",
        clientType: "URBAN_LOCAL_BODY",
        sector: "Panchayati raj",
        description:
          "Built and deployed an asset and works register for four gram panchayats, migrating eleven years of spreadsheet and paper records into a structured database with reconciliation of duplicate entries.",
        outcome:
          "All four panchayats produced their annual asset statement from the system rather than by hand; about 340 duplicate asset entries were identified and closed during migration.",
        contractValueInr: 1400000,
        startYear: 2022,
        endYear: 2023,
      },
      {
        title: "Grievance tracking for a municipal council",
        clientName: "Municipal Council, Central Kerala",
        clientType: "URBAN_LOCAL_BODY",
        sector: "Urban administration",
        description:
          "A grievance and service request system with ward-level routing and escalation reminders, deployed with two days of counter-staff training and a year of support.",
        outcome:
          "Median closure time fell from 22 days to 9 in the first year, and the council renewed the support subscription for a second term.",
        contractValueInr: 900000,
        startYear: 2023,
        endYear: null,
      },
    ],
    credentials: [
      {
        kind: "QUALITY_STANDARD",
        name: "ISO 27001 Information Security Management System",
        issuingAuthority: "Accredited certification body (demonstration record)",
        identifier: "ISMS-DEMO-551247",
        issuedOn: "2023-09-18",
        validUntil: "2026-09-17",
        notes: "Scope covers application development and support for local body systems.",
      },
      {
        kind: "EMPANELMENT",
        name: "Registered supplier, local body information technology services",
        issuingAuthority: "State Information Technology Mission (demonstration record)",
        identifier: "ITM-DEMO-KL-0551",
        issuedOn: "2022-02-14",
        validUntil: "2027-02-13",
        notes: "Registered for small-scale application development for local bodies.",
      },
    ],
    documents: [
      registrationDocument("U72900KL2018PTC055120", "2018-06-11"),
      gstDocument("32AAECD5512N1ZQ"),
      {
        documentType: "UDYAM_MSME",
        title: "Udyam registration certificate",
        referenceNumber: "UDYAM-KL-07-0055124",
        issuedOn: "2021-03-04",
        validUntil: null,
        body: [
          "Stands in for an Udyam registration certificate classifying the enterprise as micro.",
          "The registration number is synthetic.",
        ],
      },
    ],
  },
};
