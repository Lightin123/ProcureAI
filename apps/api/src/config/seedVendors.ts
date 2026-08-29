import type { VendorProfileStatus, VerificationState } from "../repositories/vendorProfiles.js";

/**
 * Demonstration suppliers.
 *
 * Chosen to span the range the platform claims to serve: a sheet-metal
 * fabricator, a farmer producer company, a road contractor, a diagnostics
 * manufacturer, a cold-chain operator, a skilling institute, a waste-recovery
 * enterprise, a software firm and an accredited testing laboratory. If the
 * onboarding, the capability document or the matching only works for the
 * software firm, this list makes that obvious immediately.
 *
 * Loaded by `npm run seed`, which writes them through the same repository and
 * derivation code the running API uses, so seeded profiles are indistinguishable
 * from ones a supplier filled in.
 */

export interface SeedVendorOffering {
  kind: "PRODUCT" | "SERVICE" | "CAPABILITY";
  name: string;
  description: string;
  categories: string[];
  tags: string[];
  sectors: string[];
}

export interface SeedVendorExperience {
  title: string;
  clientName: string;
  clientType: string;
  sector: string;
  description: string;
  outcome: string;
  contractValueInr: number;
  startYear: number;
  endYear: number | null;
}

export interface SeedVendorCredential {
  kind: string;
  name: string;
  issuingAuthority: string;
}

export interface SeedVendor {
  organizationCode: string;
  organizationName: string;
  email: string;
  fullName: string;
  status: VendorProfileStatus;
  verificationState: VerificationState;
  profile: Record<string, unknown>;
  offerings: SeedVendorOffering[];
  experience: SeedVendorExperience[];
  credentials: SeedVendorCredential[];
}

export const SEEDED_VENDORS: readonly SeedVendor[] = [
  {
    organizationCode: "VND-BHARAT-FAB",
    organizationName: "Bharat Precision Fabricators Private Limited",
    email: "supplier.manufacturing@procureai.local",
    fullName: "K. Venkatesan",
    status: "VERIFIED",
    verificationState: "VERIFIED",
    profile: {
      legalName: "Bharat Precision Fabricators Private Limited",
      organizationType: "PRIVATE_LIMITED",
      yearEstablished: 2009,
      registrationNumber: "U28910TN2009PTC073412",
      website: "https://bharatprecision.example.in",
      identifiers: { gstin: "33AABCB1234M1Z5", pan: "AABCB1234M", udyam: "UDYAM-TN-02-0014521" },
      eligibility: { flags: ["msme", "makeInIndia", "gemRegistered"], msmeCategory: "SMALL" },
      registeredAddress: {
        line1: "Plot 42, SIDCO Industrial Estate",
        line2: "Ambattur",
        city: "Chennai",
        district: "Tiruvallur",
        state: "Tamil Nadu",
        pincode: "600098",
      },
      operatingStates: ["Tamil Nadu", "Karnataka", "Andhra Pradesh", "Telangana", "Kerala"],
      primaryContact: {
        name: "K. Venkatesan",
        designation: "Managing Director",
        email: "supplier.manufacturing@procureai.local",
        phone: "+91 44 2625 8800",
      },
      authorisedRepresentative: {
        name: "K. Venkatesan",
        designation: "Managing Director",
        email: "supplier.manufacturing@procureai.local",
      },
      industries: ["MANUFACTURING", "HARDWARE_ELECTRONICS"],
      subDomains: ["Precision machining", "Light engineering & fabrication", "Contract manufacturing"],
      solutionTypes: ["PHYSICAL_PRODUCT", "MANUFACTURING_CAPABILITY", "HARDWARE_EQUIPMENT"],
      headline: "Precision sheet-metal fabrication and assembly for railway, defence and utility equipment",
      capabilitySummary:
        "We fabricate precision sheet-metal and structural assemblies to customer drawings, and we manufacture our own range of outdoor enclosures for utility and railway installations. The works covers laser cutting, CNC bending, robotic welding, powder coating and final assembly under one roof, which lets us hold tolerance across a batch and take responsibility for the finished item rather than a stage of it. Roughly two thirds of our output is build-to-print work for railway signalling and traction equipment; the remainder is our own enclosure range supplied to state electricity boards and municipal bodies.",
      problemBeingSolved:
        "Government buyers of equipment enclosures and fabricated assemblies routinely receive items that corrode within two monsoons or that do not hold dimensional tolerance across a batch, because the work is subcontracted through several small shops with no common inspection standard.",
      coreCapabilities: [
        "CNC laser cutting",
        "CNC press-brake bending",
        "Robotic MIG welding",
        "Seven-tank pre-treatment and powder coating",
        "IP65/IP66 enclosure manufacture",
        "Build-to-print fabrication",
        "Batch dimensional inspection",
      ],
      expertiseAreas: ["Sheet-metal design for manufacture", "Corrosion protection", "Railway equipment enclosures"],
      problemDomains: ["Equipment corrosion in coastal installations", "Batch dimensional consistency", "Long lead times on fabricated assemblies"],
      sectorsServed: ["Railways", "Power distribution", "Municipal infrastructure", "Defence"],
      targetCustomers: ["State electricity boards", "Railway production units", "Municipal corporations", "Defence PSUs"],
      differentiators:
        "Every process from cutting to coating is in-house, so a batch is never split across subcontractors with different standards. We hold a seven-tank pre-treatment line, which very few fabricators of our size operate, and it is the single reason our enclosures survive coastal installation where powder coat over untreated steel does not.",
      valueProposition:
        "A government buyer gets a single accountable supplier for a fabricated assembly, with in-house inspection records for every batch and a corrosion warranty we can actually honour because we control the pre-treatment.",
      deliveryModels: ["DIRECT_SUPPLY", "ON_SITE_DEPLOYMENT", "PARTNER_CHANNEL"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes:
        "Direct delivery across the five southern states from Chennai. Installation and commissioning support through our own team in Tamil Nadu and Karnataka, and through dealer partners elsewhere.",
      teamSize: 148,
      domainExpertise: ["Welding inspectors (CSWIP)", "Mechanical design engineers", "Quality engineers", "Powder coating technicians"],
      deliveryCapability:
        "Two shifts across a 4,200 square metre works. Typical order of 500 enclosures ships in eight weeks from drawing approval; we can run three concurrent build-to-print programmes without subcontracting.",
      capacityNotes: "Approximately 90 tonnes of sheet metal processed per month; 1,200 painted enclosures per month at single shift.",
      scalabilityNotes:
        "A third shift adds roughly 40 per cent capacity within six weeks. Beyond that we have a qualified second-tier fabricator in Hosur under our own inspection regime.",
      infrastructureNotes:
        "Owned 4,200 sq m works at Ambattur; 4kW fibre laser, three press brakes, two welding robots, seven-tank pre-treatment line, batch powder coating oven, CMM inspection.",
      governmentScaleReadiness: "STATE_SCALE",
      minProjectValueInr: 500_000,
      typicalProjectValueInr: 8_500_000,
      maxProjectValueInr: 120_000_000,
      governmentExperience: "MULTIPLE",
      gemRegistered: true,
      pastTenderExperience:
        "Rate contract holder with two state electricity boards for distribution enclosures. Regular bidder on railway production unit tenders for fabricated assemblies; nine awarded since 2018.",
      solutionNovelty: "IMPROVED",
      innovationStage: "SCALED",
      deploymentReadiness: "SCALE_READY",
      innovationDescription:
        "Our contribution is process rather than product: bringing pre-treatment in-house and inspecting to a batch standard, in a segment where both are normally skipped.",
      measurableImpact:
        "Warranty returns on coastal installations fell from 6.2 per cent to 0.4 per cent after the pre-treatment line was commissioned in 2019.",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        productionCapacity: "90 tonnes of sheet metal per month; 1,200 coated enclosures per month at single shift, 1,700 at double shift.",
        facilities: "Single owned works of 4,200 sq m at SIDCO Industrial Estate, Ambattur, Chennai, with a 900 sq m covered despatch yard.",
        plantAndEquipment: ["4kW fibre laser cutter", "3 x CNC press brake", "2 x welding robot", "Seven-tank pre-treatment line", "Powder coating oven", "Coordinate measuring machine"],
        materialsSourcing: "Cold-rolled and galvanised steel from primary producers on annual contract; stainless from two approved stockists. No material enters production without a mill test certificate.",
        qualityControl: "First-article inspection on every new drawing, in-process dimensional checks each shift, CMM verification on a sample from each batch, salt-spray testing quarterly on coated samples.",
        localContentPercentage: 92,
        componentSourcing: "Locks, gaskets and hinges from three qualified Indian suppliers; no imported content in the standard enclosure range.",
        afterSalesSupport: "Spares held for seven years from despatch. Replacement gaskets and locks shipped within 72 hours anywhere in south India.",
        warrantyTerms: "36 months against manufacturing defect; 60 months against coating failure on the coastal-grade range.",
        installationSupport: "Own commissioning team in Tamil Nadu and Karnataka; supervised dealer installation elsewhere.",
      },
    },
    offerings: [
      {
        kind: "PRODUCT",
        name: "Coastal-grade outdoor equipment enclosure (IP66)",
        description:
          "Powder-coated galvanised steel enclosure for outdoor electrical and signalling equipment, with seven-tank pre-treatment for coastal and high-humidity installation. Sizes from 600x400x250 mm to 2000x1200x600 mm.",
        categories: ["Enclosures", "Sheet metal products"],
        tags: ["IP66", "outdoor enclosure", "corrosion resistant", "galvanised steel", "coastal"],
        sectors: ["Power distribution", "Railways", "Telecommunications"],
      },
      {
        kind: "CAPABILITY",
        name: "Build-to-print sheet-metal fabrication",
        description:
          "Fabrication of assemblies to customer drawings, from laser cutting through welding, coating and inspection, with first-article approval and batch dimensional records.",
        categories: ["Contract manufacturing"],
        tags: ["build to print", "laser cutting", "CNC bending", "robotic welding", "contract fabrication"],
        sectors: ["Railways", "Defence", "Industrial equipment"],
      },
      {
        kind: "SERVICE",
        name: "On-site installation and commissioning",
        description:
          "Installation of supplied enclosures and assemblies at substations, wayside signalling locations and municipal sites, with handover records.",
        categories: ["Installation services"],
        tags: ["installation", "commissioning", "substation", "wayside"],
        sectors: ["Power distribution", "Railways"],
      },
    ],
    experience: [
      {
        title: "Supply of 3,200 distribution feeder pillar enclosures",
        clientName: "Tamil Nadu Generation and Distribution Corporation",
        clientType: "PSU",
        sector: "Power distribution",
        description:
          "Manufacture and delivery of coastal-grade feeder pillar enclosures across eleven distribution circles, against a two-year rate contract.",
        outcome: "Delivered in full against schedule; warranty returns of 0.3 per cent over the first three years.",
        contractValueInr: 96_000_000,
        startYear: 2021,
        endYear: 2023,
      },
      {
        title: "Fabricated relay room assemblies for signalling modernisation",
        clientName: "Integral Coach Factory",
        clientType: "CENTRAL_GOVERNMENT",
        sector: "Railways",
        description: "Build-to-print fabrication and coating of relay room racks and cable management assemblies.",
        outcome: "First-article approval at first submission on all fourteen drawings; zero dimensional rejections across the programme.",
        contractValueInr: 41_500_000,
        startYear: 2022,
        endYear: 2024,
      },
      {
        title: "Smart pole enclosures for municipal street lighting",
        clientName: "Greater Chennai Corporation",
        clientType: "URBAN_LOCAL_BODY",
        sector: "Municipal infrastructure",
        description: "Supply of pole-mounted control enclosures for a smart street lighting deployment across two zones.",
        outcome: "1,480 units delivered in eleven weeks against a fourteen-week schedule.",
        contractValueInr: 18_700_000,
        startYear: 2023,
        endYear: 2023,
      },
    ],
    credentials: [
      { kind: "CERTIFICATION", name: "ISO 9001:2015", issuingAuthority: "TUV SUD South Asia" },
      { kind: "QUALITY_STANDARD", name: "IS 13947 enclosure conformity", issuingAuthority: "Bureau of Indian Standards" },
      { kind: "EMPANELMENT", name: "GeM registered seller", issuingAuthority: "Government e-Marketplace" },
      { kind: "CERTIFICATION", name: "ISO 14001:2015", issuingAuthority: "TUV SUD South Asia" },
    ],
  },

  {
    organizationCode: "VND-SAHYADRI-AGRI",
    organizationName: "Sahyadri Farmer Producer Company Limited",
    email: "supplier.agri@procureai.local",
    fullName: "Meera Deshmukh",
    status: "VERIFIED",
    verificationState: "VERIFIED",
    profile: {
      legalName: "Sahyadri Farmer Producer Company Limited",
      organizationType: "COOPERATIVE",
      yearEstablished: 2016,
      registrationNumber: "U01100MH2016PTC287451",
      website: "https://sahyadrifpc.example.in",
      identifiers: { gstin: "27AAJCS8899K1Z2", pan: "AAJCS8899K", udyam: "UDYAM-MH-26-0038112" },
      eligibility: { flags: ["msme", "farmerProducerOrganisation", "womenLed"], msmeCategory: "SMALL" },
      registeredAddress: {
        line1: "Sahyadri Bhavan, Market Yard Road",
        city: "Nashik",
        district: "Nashik",
        state: "Maharashtra",
        pincode: "422003",
      },
      operatingStates: ["Maharashtra", "Gujarat", "Madhya Pradesh"],
      primaryContact: {
        name: "Meera Deshmukh",
        designation: "Chief Executive Officer",
        email: "supplier.agri@procureai.local",
        phone: "+91 253 259 1200",
      },
      authorisedRepresentative: { name: "Meera Deshmukh", designation: "Chief Executive Officer", email: "supplier.agri@procureai.local" },
      industries: ["AGRICULTURE", "LOGISTICS", "SUSTAINABILITY"],
      subDomains: ["Post-harvest & cold chain", "Agri-extension services", "Horticulture", "Soil & crop advisory"],
      solutionTypes: ["AGRI_ENVIRONMENTAL", "PHYSICAL_PRODUCT", "OPERATIONAL_SERVICES", "TRAINING_CAPACITY_BUILDING"],
      headline: "Farmer-owned aggregation, grading and cold chain for horticultural produce across the Nashik belt",
      capabilitySummary:
        "We are a producer company owned by 4,300 smallholder farmers across seven talukas of Nashik and Dindori. We aggregate, grade, pack and move horticultural produce — principally grapes, onion, tomato and pomegranate — and we run the extension and input advisory that makes the produce fit for institutional buyers in the first place. Our own infrastructure is three collection centres, a 1,200 tonne cold store and a grading and packing line; our field capability is eighty trained extension workers who reach every member farm at least fortnightly through the season.",
      problemBeingSolved:
        "Institutional and government buyers of fresh produce cannot source at scale from smallholders because no single farm can meet volume, grade consistency or documentation requirements, and aggregation through traders destroys traceability and the farmer's share of the price.",
      coreCapabilities: [
        "Produce aggregation from smallholder farms",
        "Grading and sorting to buyer specification",
        "Cold storage and pre-cooling",
        "Reefer transport and last-mile distribution",
        "Farmer extension and crop advisory",
        "Traceability to individual farm",
        "Residue testing coordination",
      ],
      expertiseAreas: ["Horticulture agronomy", "Post-harvest handling", "Cold chain operation", "Farmer institution building"],
      problemDomains: ["Post-harvest loss", "Smallholder market access", "Grade inconsistency in institutional supply", "Produce traceability"],
      sectorsServed: ["Public distribution", "Institutional catering", "Horticulture", "Rural development"],
      targetCustomers: ["State agriculture departments", "Mid-day meal agencies", "District administrations", "Institutional buyers"],
      differentiators:
        "The aggregation and the extension are the same organisation, so the specification a buyer sets reaches the farm as an agronomic instruction three months before harvest rather than as a rejection at the gate. Traceability runs to the individual member farm because the farmer is a shareholder, not a supplier.",
      valueProposition:
        "A government buyer gets institutional volume and consistent grade from smallholder farms, with farm-level traceability and a documented share of the price reaching the farmer.",
      deliveryModels: ["DIRECT_SUPPLY", "FIELD_OPERATIONS", "TRAINING_PROGRAMME", "MANAGED_SERVICE"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes:
        "Three collection centres in Nashik and Dindori talukas. Reefer delivery within 400 km covering Mumbai, Pune, Surat and Indore. Extension services confined to member farms in Nashik district.",
      teamSize: 96,
      domainExpertise: ["Horticulture agronomists", "Post-harvest technologists", "Field extension workers", "Cold chain operators"],
      deliveryCapability:
        "Up to 40 tonnes of graded produce despatched per day in season across four reefer vehicles, with pre-cooling within four hours of harvest.",
      capacityNotes: "1,200 tonne cold store, 8 tonne per hour grading line, three collection centres with combined 60 tonne per day intake.",
      scalabilityNotes:
        "Member base grows by roughly 400 farms a year. A fourth collection centre at Chandwad is funded and would add 25 tonnes per day of intake within a season.",
      infrastructureNotes:
        "Owned 1,200 tonne controlled-atmosphere cold store at Nashik; grading and packing line; four owned reefer vehicles and eight on contract; three collection centres.",
      governmentScaleReadiness: "DISTRICT_SCALE",
      minProjectValueInr: 300_000,
      typicalProjectValueInr: 12_000_000,
      maxProjectValueInr: 90_000_000,
      governmentExperience: "STATE",
      gemRegistered: false,
      pastTenderExperience:
        "Supplier to the state horticulture mission for two seasons of nutrition-garden planting material. Empanelled with the district supply office for fresh produce to residential schools.",
      solutionNovelty: "INNOVATIVE",
      innovationStage: "PRODUCTION",
      deploymentReadiness: "DEPLOYMENT_READY",
      innovationDescription:
        "The extension service is funded from the aggregation margin rather than from a grant, which is what makes the quality improvement durable after a project ends. Traceability is recorded at the collection centre against the member's share number, so it costs nothing extra to produce.",
      measurableImpact:
        "Post-harvest loss among member farms fell from an estimated 21 per cent to 9 per cent between 2018 and 2024. Member realisation on grape rose 17 per cent against the district mandi average over the same period.",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        cropsOrDomains: ["Table grape", "Onion", "Tomato", "Pomegranate", "Green chilli"],
        fieldDeployment:
          "Eighty trained extension workers covering seven talukas, each responsible for roughly fifty member farms with a fortnightly visit cycle through the season. Four demonstration plots run in partnership with the district agriculture office.",
        agriEquipment: ["Pre-cooling units", "Optical grading line", "Reefer vehicles", "Soil testing kits", "Moisture meters"],
        operationalRegions: ["Nashik", "Dindori", "Niphad", "Chandwad", "Sinnar", "Western Maharashtra plateau"],
        seasonality:
          "Grape from December to April, onion from November to February with stored volume through June, tomato in two cycles. Capacity for a new crop is best committed before the sowing window, not at harvest.",
        impactMetrics: ["Post-harvest loss percentage", "Farmer price realisation against mandi average", "Tonnes diverted from distress sale", "Member farms reached per season"],
        measurementMethodology:
          "Loss measured at collection centre against harvested weight recorded at farm; realisation compared against daily APMC price for the same grade. Both audited annually by the member audit committee.",
      },
    },
    offerings: [
      {
        kind: "SERVICE",
        name: "Institutional fresh produce supply with farm traceability",
        description:
          "Aggregation, grading, cold storage and delivery of horticultural produce to institutional buyers, with traceability to the individual member farm and residue test reports per consignment.",
        categories: ["Fresh produce supply", "Cold chain"],
        tags: ["fresh produce", "cold chain", "traceability", "grading", "reefer transport", "smallholder aggregation"],
        sectors: ["Public distribution", "Institutional catering", "Nutrition programmes"],
      },
      {
        kind: "SERVICE",
        name: "Farmer extension and crop advisory programme",
        description:
          "Field extension covering package of practices, input advisory, soil testing and post-harvest handling, delivered by resident extension workers on a fortnightly visit cycle.",
        categories: ["Agricultural extension", "Capacity building"],
        tags: ["extension services", "crop advisory", "soil testing", "farmer training", "package of practices"],
        sectors: ["Agriculture", "Rural development"],
      },
      {
        kind: "CAPABILITY",
        name: "Cold storage and pre-cooling operation",
        description:
          "1,200 tonne controlled-atmosphere cold store with pre-cooling, operated on own account or on behalf of a department for a season.",
        categories: ["Cold storage"],
        tags: ["cold storage", "pre-cooling", "controlled atmosphere", "post-harvest"],
        sectors: ["Horticulture", "Food processing"],
      },
    ],
    experience: [
      {
        title: "Fresh produce supply to 214 residential schools",
        clientName: "District Supply Office, Nashik",
        clientType: "STATE_GOVERNMENT",
        sector: "Nutrition programmes",
        description:
          "Twice-weekly delivery of graded vegetables to residential schools across the district under the departmental nutrition programme.",
        outcome: "Delivered 1,340 tonnes over two academic years with 0.6 per cent rejection at receipt against a permitted 5 per cent.",
        contractValueInr: 34_000_000,
        startYear: 2022,
        endYear: 2024,
      },
      {
        title: "Onion storage and staggered release for price stabilisation",
        clientName: "Maharashtra State Agricultural Marketing Board",
        clientType: "STATE_GOVERNMENT",
        sector: "Agriculture",
        description:
          "Storage of 900 tonnes of member onion and staggered release against a departmental price stabilisation instruction.",
        outcome: "Storage loss held to 11 per cent against a 20 per cent norm for the variety; release completed on schedule.",
        contractValueInr: 21_500_000,
        startYear: 2023,
        endYear: 2024,
      },
      {
        title: "Nutrition garden planting material and training",
        clientName: "State Horticulture Mission",
        clientType: "STATE_GOVERNMENT",
        sector: "Horticulture",
        description: "Supply of planting material and delivery of household training for a nutrition garden programme in four talukas.",
        outcome: "6,200 households reached; survival rate at six months recorded at 74 per cent.",
        contractValueInr: 7_800_000,
        startYear: 2021,
        endYear: 2022,
      },
    ],
    credentials: [
      { kind: "CERTIFICATION", name: "FSSAI licence (Central)", issuingAuthority: "Food Safety and Standards Authority of India" },
      { kind: "CERTIFICATION", name: "GLOBALG.A.P. (grape)", issuingAuthority: "Control Union Certifications" },
      { kind: "EMPANELMENT", name: "Registered Farmer Producer Organisation", issuingAuthority: "Small Farmers' Agribusiness Consortium" },
    ],
  },

  {
    organizationCode: "VND-KAVERI-INFRA",
    organizationName: "Kaveri Infra Constructions LLP",
    email: "supplier.construction@procureai.local",
    fullName: "R. Prabhakar",
    status: "SUBMITTED",
    verificationState: "PENDING",
    profile: {
      legalName: "Kaveri Infra Constructions LLP",
      organizationType: "LLP",
      yearEstablished: 2012,
      registrationNumber: "AAF-2291",
      identifiers: { gstin: "29AAKFK7712N1ZP", pan: "AAKFK7712N", udyam: "UDYAM-KR-03-0021884" },
      eligibility: { flags: ["msme"], msmeCategory: "MEDIUM" },
      registeredAddress: {
        line1: "No. 18, 4th Cross, Industrial Suburb",
        city: "Bengaluru",
        district: "Bengaluru Urban",
        state: "Karnataka",
        pincode: "560022",
      },
      operatingStates: ["Karnataka", "Tamil Nadu", "Telangana"],
      primaryContact: {
        name: "R. Prabhakar",
        designation: "Designated Partner",
        email: "supplier.construction@procureai.local",
        phone: "+91 80 2337 4400",
      },
      authorisedRepresentative: { name: "R. Prabhakar", designation: "Designated Partner", email: "supplier.construction@procureai.local" },
      industries: ["CONSTRUCTION", "INFRASTRUCTURE"],
      subDomains: ["Roads & highways", "Water supply & sanitation works", "Bridges & structures", "Project management consultancy"],
      solutionTypes: ["INFRASTRUCTURE_CONSTRUCTION", "OPERATIONAL_SERVICES"],
      headline: "Civil contractor for district roads, drainage and water supply works across south Karnataka",
      capabilitySummary:
        "We execute road, drainage and water supply works for district administrations and urban local bodies. Our normal package is between two and fifteen crore: rural connectivity roads, storm water drains, and distribution network laying with house service connections. We own our earthmoving and paving fleet rather than hiring it, which is why we can hold a monsoon-constrained programme where hired-plant contractors slip.",
      problemBeingSolved:
        "District road and drainage packages are routinely delayed past the working season because contractors depend on hired plant that is committed elsewhere when the window opens.",
      coreCapabilities: [
        "Bituminous road construction",
        "Storm water drain construction",
        "Water distribution network laying",
        "House service connections",
        "Culvert and minor bridge works",
        "Quantity surveying and billing",
      ],
      expertiseAreas: ["Rural connectivity roads", "Urban drainage", "Water supply distribution"],
      problemDomains: ["Monsoon-constrained construction windows", "Urban waterlogging", "Rural road connectivity"],
      sectorsServed: ["Public works", "Urban local bodies", "Rural development", "Water supply"],
      targetCustomers: ["District administrations", "Municipal corporations", "Panchayat raj engineering divisions"],
      differentiators:
        "Owned plant, not hired. Twenty-two pieces of core equipment on our own books means we mobilise on the day of the work order, and we can run three packages in parallel across the pre-monsoon window.",
      valueProposition:
        "A district engineer gets a contractor who mobilises immediately and can be held to a pre-monsoon completion date, with quantity records maintained to departmental billing format from day one.",
      deliveryModels: ["TURNKEY", "ON_SITE_DEPLOYMENT", "FIELD_OPERATIONS"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes:
        "Regular working radius of 300 km from Bengaluru covering south Karnataka. Executed packages in Krishnagiri and Mahabubnagar districts with local labour arrangements.",
      teamSize: 210,
      domainExpertise: ["Civil engineers", "Quantity surveyors", "Site safety supervisors", "Survey technicians"],
      deliveryCapability:
        "Three concurrent packages of up to eight crore each. A ten kilometre rural road package is normally completed in fourteen weeks excluding monsoon days.",
      capacityNotes: "Roughly 45 lane-kilometres of bituminous road and 18 kilometres of drain constructed per year at current fleet.",
      scalabilityNotes:
        "A fourth concurrent package requires additional supervisory staff rather than plant; we have run four packages in 2023 with two engineers hired on contract.",
      infrastructureNotes:
        "Owned fleet of 22 items including two pavers, three tandem rollers, six tippers, two excavators and a batching plant at Nelamangala. Own site laboratory for field density and bitumen content tests.",
      governmentScaleReadiness: "DISTRICT_SCALE",
      minProjectValueInr: 2_000_000,
      typicalProjectValueInr: 62_000_000,
      maxProjectValueInr: 250_000_000,
      governmentExperience: "MULTIPLE",
      gemRegistered: true,
      pastTenderExperience:
        "Registered Class I contractor with the Karnataka Public Works Department. Thirty-one packages executed for PWD, KRIDL and three municipal corporations since 2014.",
      solutionNovelty: "EXISTING",
      innovationStage: "SCALED",
      deploymentReadiness: "SCALE_READY",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        contractorClass: "Karnataka PWD Class I; Tamil Nadu Highways Class II",
        projectTypesExecuted: ["Rural connectivity roads", "Urban storm water drains", "Water distribution networks", "Minor bridges and culverts", "Internal roads for institutional campuses"],
        plantAndMachinery:
          "Two sensor pavers, three tandem rollers, one pneumatic tyred roller, six tippers, two excavators, one backhoe loader, one wet-mix plant, one 30 cum/hr batching plant, two transit mixers.",
        labourStrength: "Approximately 180 skilled and unskilled workers engaged directly or through registered labour contractors at peak.",
        safetyRecord:
          "Site safety supervisor on every package, mandatory induction, monthly toolbox talks. No fatal incident since inception; three reportable lost-time injuries in the last five years, all investigated with closure reports filed with the department.",
      },
    },
    offerings: [
      {
        kind: "SERVICE",
        name: "Rural and district road construction",
        description:
          "Construction and upgrading of rural connectivity and district roads including earthwork, granular sub-base, wet mix macadam and bituminous surfacing, executed to departmental specification with field quality records.",
        categories: ["Road construction"],
        tags: ["bituminous road", "rural roads", "wet mix macadam", "road upgrading", "civil works"],
        sectors: ["Public works", "Rural development"],
      },
      {
        kind: "SERVICE",
        name: "Storm water drainage construction",
        description:
          "Construction of RCC and masonry storm water drains, cross drainage works and outfall structures for urban local bodies.",
        categories: ["Drainage works"],
        tags: ["storm water drain", "urban drainage", "RCC drain", "waterlogging", "cross drainage"],
        sectors: ["Urban local bodies", "Municipal infrastructure"],
      },
      {
        kind: "SERVICE",
        name: "Water supply distribution network laying",
        description: "Laying of DI and HDPE distribution mains, valve chambers and house service connections, with hydraulic testing and commissioning.",
        categories: ["Water supply works"],
        tags: ["water distribution", "pipeline laying", "house service connection", "DI pipe", "HDPE"],
        sectors: ["Water supply", "Urban local bodies"],
      },
    ],
    experience: [
      {
        title: "Upgrading of 42 km of rural connectivity roads",
        clientName: "Karnataka Rural Infrastructure Development Limited",
        clientType: "PSU",
        sector: "Rural development",
        description: "Upgrading of nine road links across two taluks including cross drainage works and bituminous surfacing.",
        outcome: "Completed eleven days ahead of schedule; departmental quality audit passed without adverse observation.",
        contractValueInr: 187_000_000,
        startYear: 2022,
        endYear: 2024,
      },
      {
        title: "Storm water drain construction, Ward 46-52",
        clientName: "Bruhat Bengaluru Mahanagara Palike",
        clientType: "URBAN_LOCAL_BODY",
        sector: "Municipal infrastructure",
        description: "Construction of 9.4 km of RCC storm water drains and reconstruction of four outfall structures.",
        outcome: "Recorded waterlogging incidents in the covered wards fell from 23 to 4 in the following monsoon.",
        contractValueInr: 94_000_000,
        startYear: 2023,
        endYear: 2024,
      },
    ],
    credentials: [
      { kind: "EMPANELMENT", name: "Class I Contractor registration", issuingAuthority: "Karnataka Public Works Department" },
      { kind: "CERTIFICATION", name: "ISO 9001:2015", issuingAuthority: "Bureau Veritas" },
      { kind: "LICENCE", name: "Contract labour licence", issuingAuthority: "Office of the Labour Commissioner, Karnataka" },
    ],
  },

  {
    organizationCode: "VND-AAROGYA-DX",
    organizationName: "Aarogya Diagnostics Technologies Private Limited",
    email: "supplier.health@procureai.local",
    fullName: "Dr. Anjali Rao",
    status: "SUBMITTED",
    verificationState: "PENDING",
    profile: {
      legalName: "Aarogya Diagnostics Technologies Private Limited",
      organizationType: "PRIVATE_LIMITED",
      yearEstablished: 2019,
      registrationNumber: "U33110KA2019PTC124556",
      website: "https://aarogyadx.example.in",
      identifiers: { gstin: "29AAGCA5566P1ZK", pan: "AAGCA5566P", dpiit: "DIPP81234", udyam: "UDYAM-KR-03-0041229" },
      eligibility: { flags: ["startup", "dpiitRecognised", "msme", "womenLed"], msmeCategory: "MICRO" },
      registeredAddress: {
        line1: "Unit 3, Bioinnovation Centre, Helix Road",
        city: "Bengaluru",
        district: "Bengaluru Urban",
        state: "Karnataka",
        pincode: "560100",
      },
      operatingStates: ["Karnataka", "Maharashtra", "Odisha", "Assam", "Rajasthan"],
      primaryContact: {
        name: "Dr. Anjali Rao",
        designation: "Founder and Chief Executive",
        email: "supplier.health@procureai.local",
        phone: "+91 80 4712 6600",
      },
      authorisedRepresentative: { name: "Dr. Anjali Rao", designation: "Founder and Chief Executive", email: "supplier.health@procureai.local" },
      industries: ["HEALTHCARE", "HARDWARE_ELECTRONICS", "RESEARCH_INNOVATION"],
      subDomains: ["Diagnostics & laboratory services", "Medical devices & equipment", "Public health programmes", "Applied research & development"],
      solutionTypes: ["HARDWARE_EQUIPMENT", "PHYSICAL_PRODUCT", "RESEARCH_INNOVATION", "OPERATIONAL_SERVICES"],
      headline: "Battery-operated point-of-care haematology analyser for primary health centres without reliable power",
      capabilitySummary:
        "We design and manufacture a portable haematology analyser intended for primary health centres and sub-centres that have neither reliable mains power nor a trained laboratory technician. The instrument runs a full blood count from a finger-prick sample in under four minutes on battery, and reports through a health worker's phone so a result reaches the district record without a paper register. We manufacture in Bengaluru and operate the field service network ourselves in the five states where we are deployed.",
      problemBeingSolved:
        "Anaemia screening at the primary level fails because the analysers available need mains power, a laboratory technician and venous sampling, none of which a sub-centre reliably has. Samples are therefore referred upward and most never return a result.",
      coreCapabilities: [
        "Point-of-care diagnostic device manufacture",
        "Battery-operated instrumentation design",
        "Field service and calibration network",
        "Health worker training",
        "Reagent supply chain",
        "Diagnostic data reporting to district systems",
      ],
      expertiseAreas: ["Haematology instrumentation", "Low-resource medical device design", "Public health screening programmes"],
      problemDomains: ["Anaemia screening at the primary level", "Diagnostic access without laboratory infrastructure", "Loss to follow-up on referred samples"],
      sectorsServed: ["Public health", "Primary healthcare", "Maternal and child health"],
      targetCustomers: ["State health departments", "District health societies", "National health programmes", "NGOs running health camps"],
      differentiators:
        "The instrument was designed around the sub-centre rather than adapted down from a hospital analyser: finger-prick sampling, eight hours of battery operation, no cold chain for reagents up to 35 degrees, and an interface a health worker can use after a two-hour training.",
      valueProposition:
        "A state health department can screen at the sub-centre instead of referring upward, and gets the result into its own district record on the day it is taken.",
      deliveryModels: ["DIRECT_SUPPLY", "ON_SITE_DEPLOYMENT", "MANAGED_SERVICE", "TRAINING_PROGRAMME"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes:
        "Own field service engineers in Karnataka, Maharashtra and Odisha. Assam and Rajasthan served through trained partner engineers under our own calibration protocol.",
      teamSize: 64,
      domainExpertise: ["Biomedical engineers", "Clinical laboratory scientists", "Field service engineers", "Public health programme managers"],
      deliveryCapability:
        "600 instruments per quarter from the Bengaluru line. Deployment includes site survey, installation, health worker training and a first calibration visit within thirty days.",
      capacityNotes: "Manufacturing capacity of 200 instruments per month at single shift; reagent cartridge supply of 90,000 tests per month.",
      scalabilityNotes:
        "A second assembly line is designed and can be commissioned in four months, taking capacity to 500 instruments per month. Reagent filling is the binding constraint beyond that and would need a contract filler.",
      infrastructureNotes:
        "ISO 13485 assembly and test facility of 900 sq m in Bengaluru; environmental test chamber; reagent formulation laboratory; field service depots in three states.",
      governmentScaleReadiness: "STATE_SCALE",
      minProjectValueInr: 1_500_000,
      typicalProjectValueInr: 28_000_000,
      maxProjectValueInr: 180_000_000,
      governmentExperience: "STATE",
      gemRegistered: true,
      pastTenderExperience:
        "Supplied under two state health department procurements and one national programme pilot. Empanelled on GeM under medical devices.",
      solutionNovelty: "INNOVATIVE",
      innovationStage: "PRODUCTION",
      deploymentReadiness: "SCALE_READY",
      innovationDescription:
        "Conventional impedance haematology needs a stable power supply and a temperature-controlled reagent. We replaced the fluidics with a cartridge that carries its own reagent in a stabilised form and runs on a 24V battery, which is what lets the instrument work at a sub-centre. The cartridge chemistry is the patented part.",
      measurableImpact:
        "Across 1,840 deployed instruments, anaemia screening coverage in the covered sub-centres rose from 31 per cent to 78 per cent of registered pregnancies, and same-day result availability from 12 per cent to 94 per cent.",
      hasIntellectualProperty: true,
      intellectualPropertyDetails:
        "Indian patent 447192 granted 2023 for the stabilised reagent cartridge; two further applications pending on the optical detection assembly.",
      dynamicAnswers: {
        regulatoryApprovals: ["CDSCO Class B medical device licence", "ISO 13485:2016", "NABL-traceable calibration"],
        clinicalValidation:
          "Method comparison study against a reference impedance analyser across 1,206 paired samples at three district hospitals, published 2022; correlation of 0.97 on haemoglobin and 0.94 on total leucocyte count.",
        coldChainCapability:
          "Reagent cartridges are stable to 35 degrees for twelve months, which removes the cold chain entirely below that. Above 35 degrees an insulated carrier is supplied for last-mile transport.",
        componentSourcing:
          "Optical assembly and pump imported from two qualified suppliers; enclosure, board assembly and battery pack sourced in India. Present indigenous content is 68 per cent by value.",
        afterSalesSupport:
          "Own field service engineers in three states and trained partner engineers in two more. Calibration visit every six months included in the supply contract; median fault response of 48 hours.",
        warrantyTerms: "24 months comprehensive, extendable to 60 months with an annual maintenance contract.",
        installationSupport: "Site survey, installation, two-hour health worker training and a thirty-day post-installation calibration visit are included in every deployment.",
        researchFacilities: "Reagent formulation laboratory and environmental test chamber in the Bengaluru facility.",
        accreditations: ["ISO 13485:2016", "CDSCO manufacturing licence"],
        publications: "Two peer-reviewed method comparison papers, 2022 and 2024. One state programme evaluation published by the department in 2023.",
        researchCollaborations: "Joint validation work with a state medical college and with the district health society in Koraput.",
      },
    },
    offerings: [
      {
        kind: "PRODUCT",
        name: "Portable point-of-care haematology analyser",
        description:
          "Battery-operated haematology analyser producing a full blood count from a finger-prick sample in under four minutes, designed for use by a health worker at a sub-centre without mains power or laboratory infrastructure.",
        categories: ["Medical devices", "Diagnostic equipment"],
        tags: ["haematology analyser", "point of care", "anaemia screening", "battery operated", "finger prick", "primary health centre"],
        sectors: ["Public health", "Primary healthcare"],
      },
      {
        kind: "PRODUCT",
        name: "Stabilised reagent cartridge",
        description:
          "Single-use reagent cartridge stable to 35 degrees for twelve months, removing the cold chain requirement for point-of-care haematology in the field.",
        categories: ["Diagnostic consumables"],
        tags: ["reagent cartridge", "cold chain free", "diagnostic consumable", "shelf stable"],
        sectors: ["Public health", "Diagnostics"],
      },
      {
        kind: "SERVICE",
        name: "Screening programme deployment and support",
        description:
          "End-to-end deployment for a district or state screening programme: site survey, installation, health worker training, six-monthly calibration, reagent supply and reporting into the district health record.",
        categories: ["Managed services", "Programme delivery"],
        tags: ["screening programme", "health worker training", "calibration", "device deployment", "district health"],
        sectors: ["Public health", "Maternal and child health"],
      },
    ],
    experience: [
      {
        title: "Anaemia screening deployment across 640 sub-centres",
        clientName: "Department of Health and Family Welfare, Odisha",
        clientType: "STATE_GOVERNMENT",
        sector: "Public health",
        description:
          "Supply, installation and support of 640 analysers with reagent supply and health worker training across nine districts.",
        outcome: "Screening coverage of registered pregnancies rose from 34 per cent to 81 per cent within eighteen months.",
        contractValueInr: 96_000_000,
        startYear: 2022,
        endYear: 2024,
      },
      {
        title: "Tribal health outreach screening pilot",
        clientName: "District Health Society, Koraput",
        clientType: "STATE_GOVERNMENT",
        sector: "Public health",
        description: "Pilot deployment of 45 analysers to mobile outreach teams in scheduled areas, with validation against district hospital results.",
        outcome: "Same-day result availability of 96 per cent; the pilot was the basis for the state-wide procurement that followed.",
        contractValueInr: 8_400_000,
        startYear: 2021,
        endYear: 2022,
      },
    ],
    credentials: [
      { kind: "LICENCE", name: "CDSCO Class B medical device manufacturing licence", issuingAuthority: "Central Drugs Standard Control Organisation" },
      { kind: "CERTIFICATION", name: "ISO 13485:2016", issuingAuthority: "TUV Rheinland India" },
      { kind: "INTELLECTUAL_PROPERTY", name: "Indian Patent 447192 — stabilised reagent cartridge", issuingAuthority: "Office of the Controller General of Patents" },
      { kind: "AWARD", name: "National Startup Award, Healthcare category", issuingAuthority: "Department for Promotion of Industry and Internal Trade" },
    ],
  },

  {
    organizationCode: "VND-PRAGATI-SKILL",
    organizationName: "Pragati Skill Development Foundation",
    email: "supplier.skilling@procureai.local",
    fullName: "S. Fatima Begum",
    status: "SUBMITTED",
    verificationState: "PENDING",
    profile: {
      legalName: "Pragati Skill Development Foundation",
      organizationType: "SOCIETY_TRUST",
      yearEstablished: 2014,
      registrationNumber: "S/2014/DL/44219",
      identifiers: { pan: "AABTP1122F", gstin: "07AABTP1122F1ZQ" },
      eligibility: { flags: ["womenLed"] },
      registeredAddress: {
        line1: "B-7, Institutional Area, Sector 12",
        city: "New Delhi",
        district: "South West Delhi",
        state: "Delhi",
        pincode: "110075",
      },
      operatingStates: ["Delhi", "Uttar Pradesh", "Bihar", "Jharkhand", "Haryana", "Rajasthan"],
      primaryContact: {
        name: "S. Fatima Begum",
        designation: "Executive Director",
        email: "supplier.skilling@procureai.local",
        phone: "+91 11 2612 8890",
      },
      authorisedRepresentative: { name: "S. Fatima Begum", designation: "Executive Director", email: "supplier.skilling@procureai.local" },
      industries: ["EDUCATION", "PROFESSIONAL_SERVICES"],
      subDomains: ["Vocational skilling", "Teacher training", "Assessment & certification", "Educational content & curriculum"],
      solutionTypes: ["TRAINING_CAPACITY_BUILDING", "PROFESSIONAL_SERVICES", "OPERATIONAL_SERVICES"],
      headline: "Vocational skilling and placement for first-generation learners across six north Indian states",
      capabilitySummary:
        "We run vocational skilling centres and mobile training units for candidates who are the first in their family to seek formal employment. Our trades are construction skills, retail operations, healthcare support and garment manufacture, all aligned to NSQF and assessed by third-party assessment bodies. We are unusual in the sector in that we track placement retention at twelve months rather than at three, and we publish the number.",
      problemBeingSolved:
        "Skilling programmes report placement at three months, by which point a large share of first-generation entrants have already left the job. The training does not address the reasons they leave, which are rarely technical.",
      coreCapabilities: [
        "NSQF-aligned vocational training",
        "Mobile training unit operation",
        "Third-party assessment coordination",
        "Placement and employer liaison",
        "Post-placement retention support",
        "Trainer development",
        "Curriculum contextualisation",
      ],
      expertiseAreas: ["First-generation learner pedagogy", "Employer engagement", "Retention counselling", "Trade curriculum design"],
      problemDomains: ["Placement retention among first-generation entrants", "Rural access to vocational training", "Trainer quality in remote centres"],
      sectorsServed: ["Skill development", "Education", "Rural livelihoods", "Women's economic empowerment"],
      targetCustomers: ["State skill development missions", "District administrations", "Corporate social responsibility programmes", "National skilling agencies"],
      differentiators:
        "Twelve-month retention tracking with published figures, and a residential option for women candidates from districts where daily travel is not possible. Both are reasons our completion rate for women is 84 per cent against a sector norm nearer 60.",
      valueProposition:
        "A skill mission gets a delivery partner whose reported outcome is retention at a year, verifiable against employer records, rather than a placement letter at three months.",
      deliveryModels: ["TRAINING_PROGRAMME", "FIELD_OPERATIONS", "MANAGED_SERVICE", "CONSULTING_ENGAGEMENT"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes:
        "Fourteen fixed centres across six states and six mobile training units covering blocks without a centre within reach. Residential facility for women candidates at three centres.",
      teamSize: 312,
      domainExpertise: ["NSQF-certified trainers", "Assessment coordinators", "Placement officers", "Counsellors"],
      deliveryCapability:
        "Approximately 9,000 candidates trained per year across fourteen centres and six mobile units, in batches of 25 to 30 over three to six months depending on the trade.",
      capacityNotes: "Simultaneous capacity of 2,400 candidates in training; residential capacity of 180.",
      scalabilityNotes:
        "A new fixed centre takes ninety days from site handover to first batch. Trainer supply is the constraint, not premises; we run our own trainer development programme to manage it.",
      infrastructureNotes:
        "Fourteen leased training centres with trade workshops; six mobile training units on 32-foot chassis; three residential hostels for women candidates.",
      governmentScaleReadiness: "STATE_SCALE",
      minProjectValueInr: 800_000,
      typicalProjectValueInr: 34_000_000,
      maxProjectValueInr: 220_000_000,
      governmentExperience: "MULTIPLE",
      gemRegistered: false,
      pastTenderExperience:
        "Delivery partner under two state skill missions and a centrally sponsored skilling scheme. Sixteen programme awards since 2016.",
      solutionNovelty: "IMPROVED",
      innovationStage: "SCALED",
      deploymentReadiness: "SCALE_READY",
      innovationDescription:
        "The retention intervention is a structured six-month post-placement contact schedule handled by the same counsellor who trained the candidate, which is what makes it work; a call centre doing the same calls did not move the number when we tested it in 2019.",
      measurableImpact:
        "Twelve-month placement retention of 61 per cent across 38,400 candidates trained since 2016, against an internally measured 29 per cent before the retention programme was introduced. Female completion rate of 84 per cent.",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        learnerReach: "38,400 candidates trained since 2016; approximately 9,000 per year at current capacity.",
        curriculumAlignment:
          "All trades aligned to NSQF levels 3 to 5 under NCVET-recognised awarding bodies. Contextualised trainer guides developed in Hindi, Bhojpuri and Santali for the relevant centres.",
        trainerPool: "196 NSQF-certified trainers on staff, with an internal trainer development programme producing roughly 40 new trainers a year.",
        languagesSupported: ["Hindi", "English", "Bhojpuri", "Santali", "Maithili"],
        serviceCategories: ["Vocational training delivery", "Assessment coordination", "Placement services", "Trainer development", "Programme monitoring"],
        teamQualifications:
          "Trainers hold NSQF Trainer certification for their trade; counsellors hold a postgraduate qualification in social work or psychology; placement officers are recruited from the industries they place into.",
        engagementModel: "Outcome-linked contracts with milestone payments on enrolment, certification and verified placement retention.",
        concurrentEngagements: 9,
        serviceLevels:
          "Batch commencement within thirty days of work order; certification within sixty days of batch completion; monthly progress reporting in the mission's own format.",
      },
    },
    offerings: [
      {
        kind: "SERVICE",
        name: "NSQF-aligned vocational training delivery",
        description:
          "Delivery of NSQF-aligned vocational training in construction skills, retail operations, healthcare support and garment manufacture, including assessment coordination and certification.",
        categories: ["Vocational training"],
        tags: ["NSQF", "vocational training", "skill development", "certification", "trade training"],
        sectors: ["Skill development", "Education"],
      },
      {
        kind: "SERVICE",
        name: "Mobile training unit operation",
        description:
          "Fully equipped mobile training units delivering trade training in blocks without a fixed centre within reach, including trainer, equipment and assessment.",
        categories: ["Mobile training"],
        tags: ["mobile training unit", "rural skilling", "last mile training", "block level"],
        sectors: ["Skill development", "Rural livelihoods"],
      },
      {
        kind: "SERVICE",
        name: "Placement and twelve-month retention support",
        description:
          "Employer liaison, placement and a structured six-month post-placement counselling schedule, with retention verified against employer records at twelve months.",
        categories: ["Placement services"],
        tags: ["placement", "retention", "employer liaison", "counselling", "post placement support"],
        sectors: ["Skill development", "Employment"],
      },
    ],
    experience: [
      {
        title: "Skilling of 12,000 candidates under the state skill mission",
        clientName: "Bihar Skill Development Mission",
        clientType: "STATE_GOVERNMENT",
        sector: "Skill development",
        description: "Training, assessment and placement across four trades in eleven districts over three years.",
        outcome: "11,640 certified; twelve-month retention of 58 per cent verified against employer payroll records.",
        contractValueInr: 212_000_000,
        startYear: 2020,
        endYear: 2023,
      },
      {
        title: "Residential skilling programme for women in scheduled areas",
        clientName: "Department of Women and Child Development, Jharkhand",
        clientType: "STATE_GOVERNMENT",
        sector: "Women's economic empowerment",
        description: "Residential training for 1,800 women candidates from scheduled areas across two trades, with hostel and childcare provision.",
        outcome: "Completion rate of 87 per cent; placement retention at twelve months of 64 per cent.",
        contractValueInr: 58_000_000,
        startYear: 2022,
        endYear: 2024,
      },
    ],
    credentials: [
      { kind: "EMPANELMENT", name: "Training Partner registration", issuingAuthority: "National Skill Development Corporation" },
      { kind: "CERTIFICATION", name: "ISO 9001:2015", issuingAuthority: "Intertek" },
      { kind: "EMPANELMENT", name: "Recognised training body", issuingAuthority: "Bihar Skill Development Mission" },
    ],
  },

  {
    organizationCode: "VND-PUNARCHAKRA",
    organizationName: "Punarchakra Resource Recovery Private Limited",
    email: "supplier.environment@procureai.local",
    fullName: "Ajay Bhatt",
    status: "DRAFT",
    verificationState: "UNVERIFIED",
    profile: {
      legalName: "Punarchakra Resource Recovery Private Limited",
      organizationType: "PRIVATE_LIMITED",
      yearEstablished: 2020,
      registrationNumber: "U37100GJ2020PTC115678",
      identifiers: { gstin: "24AAFCP3344R1ZY", pan: "AAFCP3344R", dpiit: "DIPP96412" },
      eligibility: { flags: ["startup", "dpiitRecognised", "msme"], msmeCategory: "MICRO" },
      registeredAddress: {
        line1: "Survey 118, GIDC Estate",
        city: "Ahmedabad",
        district: "Ahmedabad",
        state: "Gujarat",
        pincode: "382445",
      },
      operatingStates: ["Gujarat", "Rajasthan", "Maharashtra"],
      primaryContact: {
        name: "Ajay Bhatt",
        designation: "Director",
        email: "supplier.environment@procureai.local",
        phone: "+91 79 4004 1120",
      },
      authorisedRepresentative: { name: "Ajay Bhatt", designation: "Director", email: "supplier.environment@procureai.local" },
      industries: ["SUSTAINABILITY", "INFRASTRUCTURE", "MANUFACTURING"],
      subDomains: ["Waste recycling & circular economy", "Waste management", "Environmental impact assessment"],
      solutionTypes: ["OPERATIONAL_SERVICES", "AGRI_ENVIRONMENTAL", "PHYSICAL_PRODUCT", "INFRASTRUCTURE_CONSTRUCTION"],
      headline: "Decentralised municipal solid waste processing and construction-debris recovery for urban local bodies",
      capabilitySummary:
        "We set up and operate decentralised waste processing units for urban local bodies — ward-level composting and material recovery facilities that keep organic and recyclable fractions out of the landfill without a city-scale plant. We also run a construction and demolition debris recovery line that produces recycled aggregate to IS specification. Our model is to build the unit, operate it for the contracted period and train the municipal staff who take it over.",
      problemBeingSolved:
        "Urban local bodies below a million population cannot justify a centralised waste plant, so their entire mixed waste stream reaches a landfill that is already at capacity, and construction debris is dumped at the city edge.",
      coreCapabilities: [
        "Decentralised composting unit operation",
        "Material recovery facility operation",
        "Construction and demolition debris processing",
        "Recycled aggregate production",
        "Waste characterisation studies",
        "Municipal staff training",
      ],
      expertiseAreas: ["Decentralised waste processing", "Circular economy for construction materials", "Municipal waste characterisation"],
      problemDomains: ["Landfill saturation in small cities", "Construction debris dumping", "Segregation compliance at ward level"],
      sectorsServed: ["Urban local bodies", "Municipal infrastructure", "Environment"],
      targetCustomers: ["Municipal corporations", "Nagar palikas", "Urban development authorities"],
      differentiators:
        "Build-operate-train rather than build-and-leave: the municipality's own sanitation staff run the unit by the end of the contract, which is why our units are still running three years after handover where the sector norm is that they stop.",
      valueProposition:
        "A municipality gets landfill diversion it can sustain on its own budget and staff after the contract ends, and a saleable aggregate stream from debris it is currently paying to dump.",
      deliveryModels: ["TURNKEY", "MANAGED_SERVICE", "ON_SITE_DEPLOYMENT", "TRAINING_PROGRAMME"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes: "Operating units in Gujarat and Rajasthan; one contracted unit in Maharashtra commissioning this year.",
      teamSize: 78,
      domainExpertise: ["Environmental engineers", "Plant operators", "Waste characterisation analysts"],
      deliveryCapability:
        "A 10 tonne per day ward-level composting unit is commissioned in ninety days from site handover. We can run four commissioning programmes concurrently.",
      capacityNotes:
        "Currently operating eleven units with a combined 140 tonnes per day of municipal solid waste and one C&D line at 300 tonnes per day.",
      scalabilityNotes: "Unit fabrication is subcontracted to two qualified fabricators, so capacity scales with commissioning staff rather than plant.",
      infrastructureNotes: "Owned C&D recovery line at Ahmedabad; eleven operated municipal units; mobile waste characterisation kit.",
      governmentScaleReadiness: "DISTRICT_SCALE",
      minProjectValueInr: 1_200_000,
      typicalProjectValueInr: 24_000_000,
      maxProjectValueInr: 140_000_000,
      governmentExperience: "LOCAL_BODY",
      gemRegistered: false,
      solutionNovelty: "INNOVATIVE",
      innovationStage: "PILOT",
      deploymentReadiness: "DEPLOYMENT_READY",
      innovationDescription:
        "The unit design is deliberately unsophisticated — no imported machinery, no component a municipal fitter cannot replace locally — because the failure mode in this sector is not process, it is maintenance after handover.",
      measurableImpact:
        "Across eleven operating units, 46,000 tonnes diverted from landfill since 2021, and nine of eleven units still operating at above 70 per cent of design throughput two years after municipal handover.",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        impactMetrics: ["Tonnes diverted from landfill", "Compost produced per tonne of input", "Recycled aggregate produced", "Units operating at design throughput post-handover"],
        measurementMethodology:
          "Weighbridge records at each unit reconciled monthly with municipal collection records. Post-handover throughput audited quarterly for two years after handover under the contract.",
        cropsOrDomains: ["Municipal solid waste", "Construction and demolition debris", "Horticultural waste"],
        fieldDeployment: "Resident operating team of four to six at each unit for the contracted period, with a two-person commissioning team mobilised per new site.",
        operationalRegions: ["Ahmedabad", "Gandhinagar", "Jaipur", "Udaipur", "Nashik"],
        productionCapacity: "Recycled aggregate output of approximately 220 tonnes per day from the Ahmedabad C&D line.",
        facilities: "One owned C&D recovery line on a 1.2 hectare leased plot at GIDC Ahmedabad; eleven municipal sites operated under contract.",
        qualityControl: "Recycled aggregate tested to IS 383 for water absorption, impact value and grading on every 500 tonne lot.",
      },
    },
    offerings: [
      {
        kind: "SERVICE",
        name: "Decentralised ward-level waste processing (build-operate-train)",
        description:
          "Design, construction and operation of ward-level composting and material recovery units, with training and handover of the operating municipality's own staff at the end of the contract period.",
        categories: ["Waste management", "Municipal services"],
        tags: ["decentralised composting", "material recovery facility", "solid waste management", "landfill diversion", "ward level", "build operate transfer"],
        sectors: ["Urban local bodies", "Environment"],
      },
      {
        kind: "PRODUCT",
        name: "Recycled construction aggregate (IS 383)",
        description:
          "Recycled coarse and fine aggregate produced from construction and demolition debris, tested to IS 383 and supplied for non-structural concrete, sub-base and filling.",
        categories: ["Construction materials"],
        tags: ["recycled aggregate", "C&D waste", "IS 383", "circular economy", "sub-base material"],
        sectors: ["Construction", "Municipal infrastructure"],
      },
      {
        kind: "SERVICE",
        name: "Municipal waste characterisation study",
        description:
          "Ward-wise waste characterisation and quantification study with seasonal sampling, producing the baseline a municipality needs before procuring processing capacity.",
        categories: ["Environmental consultancy"],
        tags: ["waste characterisation", "waste audit", "municipal planning", "baseline study"],
        sectors: ["Urban local bodies", "Environment"],
      },
    ],
    experience: [
      {
        title: "Eleven decentralised waste processing units",
        clientName: "Ahmedabad Municipal Corporation",
        clientType: "URBAN_LOCAL_BODY",
        sector: "Municipal infrastructure",
        description: "Construction and three-year operation of eleven ward-level composting and material recovery units, with staff training and handover.",
        outcome: "46,000 tonnes diverted from landfill; nine of eleven units operating above 70 per cent of design throughput two years after handover.",
        contractValueInr: 132_000_000,
        startYear: 2021,
        endYear: null,
      },
      {
        title: "Construction and demolition debris recovery line",
        clientName: "Jaipur Municipal Corporation (Heritage)",
        clientType: "URBAN_LOCAL_BODY",
        sector: "Environment",
        description: "Establishment and operation of a 150 tonne per day C&D debris processing line with aggregate offtake arrangement.",
        outcome: "Debris dumping at three identified city-edge sites ceased within eight months of commissioning.",
        contractValueInr: 47_000_000,
        startYear: 2023,
        endYear: null,
      },
    ],
    credentials: [
      { kind: "LICENCE", name: "Consent to Operate", issuingAuthority: "Gujarat Pollution Control Board" },
      { kind: "CERTIFICATION", name: "ISO 14001:2015", issuingAuthority: "DNV" },
      { kind: "AWARD", name: "Swachh Technology Challenge, state winner", issuingAuthority: "Ministry of Housing and Urban Affairs" },
    ],
  },

  {
    organizationCode: "VND-DEMO",
    organizationName: "Demo Vendor Solutions Private Limited",
    email: "vendor@procureai.local",
    fullName: "S. Nair",
    status: "DRAFT",
    verificationState: "UNVERIFIED",
    profile: {
      legalName: "Demo Vendor Solutions Private Limited",
      organizationType: "PRIVATE_LIMITED",
      yearEstablished: 2018,
      registeredAddress: { city: "Kochi", state: "Kerala" },
      operatingStates: ["Kerala"],
      primaryContact: { name: "S. Nair", email: "vendor@procureai.local" },
      industries: ["SOFTWARE_DIGITAL"],
      headline: "Demonstration supplier account with a deliberately incomplete profile",
      capabilitySummary:
        "This account exists to demonstrate the onboarding experience from the beginning. Its profile is intentionally left largely empty so the guided questionnaire, the completion tracking and the improvement suggestions can be shown working on a genuinely incomplete record.",
    },
    offerings: [],
    experience: [],
    credentials: [],
  },

  /**
   * Present specifically to demonstrate what semantic retrieval adds.
   *
   * This cooperative does exactly the work the solar street lighting package
   * describes, but says so in its own vocabulary: it writes about "decentralised
   * renewable electrification" and "habitations beyond the distribution
   * network", not about "street lighting" or "luminaires". A keyword matcher
   * reads the two texts as unrelated. The concept-space embedding does not,
   * because both are about renewable power and illumination for places the grid
   * does not reach.
   *
   * The profile is otherwise ordinary and the organisation is a plausible one —
   * the wording is not contrived to defeat the lexical matcher, it is how a
   * rural energy cooperative actually describes itself.
   */
  {
    organizationCode: "VND-URJA-SAHKAR",
    organizationName: "Urja Sahkar Rural Energy Cooperative Limited",
    email: "supplier.energy@procureai.local",
    fullName: "Nandita Rao",
    status: "SUBMITTED",
    verificationState: "VERIFIED",
    profile: {
      legalName: "Urja Sahkar Rural Energy Cooperative Limited",
      organizationType: "COOPERATIVE",
      yearEstablished: 2014,
      registrationNumber: "U40108MH2014PLC259871",
      website: "https://urjasahkar.example.in",
      identifiers: { gstin: "27AAGCU5521M1ZP", pan: "AAGCU5521M", udyam: "UDYAM-MH-18-0091244" },
      eligibility: { flags: ["msme", "cooperative"], msmeCategory: "SMALL" },
      registeredAddress: {
        line1: "Urja Bhavan, Station Road",
        city: "Ahmednagar",
        district: "Ahmednagar",
        state: "Maharashtra",
        pincode: "414001",
      },
      operatingStates: ["Maharashtra", "Karnataka", "Madhya Pradesh"],
      primaryContact: {
        name: "Nandita Rao",
        designation: "Managing Director",
        email: "supplier.energy@procureai.local",
        phone: "+91 241 242 8890",
      },
      authorisedRepresentative: {
        name: "Nandita Rao",
        designation: "Managing Director",
        email: "supplier.energy@procureai.local",
      },
      industries: ["ENERGY", "INFRASTRUCTURE", "SUSTAINABILITY"],
      subDomains: ["Decentralised renewable energy", "Rural electrification", "Energy storage"],
      solutionTypes: ["PHYSICAL_PRODUCT", "INFRASTRUCTURE_CONSTRUCTION", "OPERATIONAL_SERVICES"],
      headline:
        "Decentralised renewable electrification for habitations beyond the distribution network",
      capabilitySummary:
        "We build and maintain autonomous renewable power installations for habitations that the distribution network reaches unreliably or not at all. Our work is photovoltaic generation paired with electrochemical storage, sized so that a hamlet has usable power through the hours of darkness and through a monsoon week of cloud cover. We have installed roughly 9,400 autonomous units across three states since 2014, and we hold the maintenance obligation on 7,100 of them, which is why our designs favour a serviceable battery and a replaceable driver over a sealed assembly.",
      problemBeingSolved:
        "Habitations at the end of a feeder receive power too intermittently to be useful after dark, and the gram panchayat cannot meet a recurring energy bill even where a connection exists, so conventional fittings are installed once and then abandoned unlit.",
      coreCapabilities: [
        "Autonomous photovoltaic installation",
        "Electrochemical storage sizing and replacement",
        "Habitation-level electrification survey",
        "Long-duration maintenance obligations",
        "Community operator training",
      ],
      expertiseAreas: [
        "Off-grid renewable generation",
        "Battery lifecycle management in field conditions",
        "Rural energy cooperatives",
      ],
      problemDomains: [
        "Unelectrified habitations",
        "Recurring energy cost at panchayat level",
        "Abandoned fittings after installation",
      ],
      sectorsServed: ["Rural development", "Energy", "Panchayati raj"],
      targetCustomers: [
        "Gram panchayats",
        "Zilla parishads",
        "State renewable energy agencies",
        "District administrations",
      ],
      differentiators:
        "We keep the maintenance obligation rather than handing over and leaving, which is why 7,100 of our 9,400 installations are still functioning. The sector norm is that an autonomous installation stops working in its third year when the storage fails and nobody is contracted to replace it.",
      valueProposition:
        "A panchayat gets power after dark that carries no recurring bill and does not stop working in year three, because the storage replacement is contracted from the outset.",
      deliveryModels: ["DIRECT_SUPPLY", "TURNKEY", "ON_SITE_DEPLOYMENT", "MANAGED_SERVICE"],
      serviceCoverage: "MULTI_STATE",
      coverageNotes:
        "Installation and maintenance teams based at Ahmednagar, Belagavi and Betul, covering 14 districts across three states.",
      teamSize: 132,
      domainExpertise: [
        "Renewable energy engineers",
        "Storage technicians",
        "Field survey teams",
      ],
      deliveryCapability:
        "Up to 260 autonomous installations commissioned per month across six field teams, with a survey-to-commissioning cycle of five weeks.",
      capacityNotes:
        "Assembly and testing facility at Ahmednagar rated at 400 units per month. Storage replacement programme covering 7,100 installations under maintenance.",
      scalabilityNotes:
        "A seventh field team can be raised within a quarter; assembly capacity is the binding constraint above 400 units per month.",
      infrastructureNotes:
        "Owned assembly and testing facility at Ahmednagar, three district depots, and a field-returns laboratory for storage failure analysis.",
      governmentScaleReadiness: "STATE_SCALE",
      minProjectValueInr: 2_500_000,
      typicalProjectValueInr: 38_000_000,
      maxProjectValueInr: 260_000_000,
      governmentExperience: "STATE",
      gemRegistered: true,
      pastTenderExperience:
        "Empanelled with the state renewable energy agency since 2018 and awarded four district-level electrification packages under competitive tender.",
      solutionNovelty: "INCREMENTAL",
      innovationStage: "SCALING",
      deploymentReadiness: "DEPLOYMENT_READY",
      innovationDescription:
        "The design decision that matters is serviceability: every failure-prone component is replaceable by a district technician with ordinary tools, because the constraint in this sector is maintenance access rather than generation efficiency.",
      measurableImpact:
        "9,400 autonomous installations across three states since 2014, of which 7,100 remain under our maintenance obligation and 94 per cent were functioning at the most recent quarterly audit.",
      hasIntellectualProperty: false,
      dynamicAnswers: {
        impactMetrics: [
          "Installations functioning at quarterly audit",
          "Hours of usable power after dark",
          "Storage replacements completed within obligation",
        ],
        measurementMethodology:
          "Quarterly physical audit of a 5 per cent sample across every district, reconciled with the maintenance ticket record.",
        operationalRegions: ["Ahmednagar", "Solapur", "Belagavi", "Betul", "Chhindwara"],
        productionCapacity: "400 autonomous units per month from the Ahmednagar assembly line.",
        facilities:
          "Assembly and testing facility at Ahmednagar; district depots at Belagavi and Betul; field-returns laboratory.",
        fieldDeployment:
          "Six commissioning teams of four, plus district maintenance technicians covering 14 districts.",
      },
    },
    offerings: [
      {
        kind: "PRODUCT",
        name: "Autonomous photovoltaic illumination unit",
        description:
          "A self-contained pole-mounted unit comprising a photovoltaic module, electrochemical storage, driver and fitting, sized for eleven hours of output after a single day of charging under monsoon cloud cover.",
        categories: ["Renewable energy", "Rural electrification"],
        tags: ["autonomous", "photovoltaic", "storage", "pole-mounted"],
        sectors: ["Rural development", "Energy"],
      },
      {
        kind: "SERVICE",
        name: "Habitation electrification survey and siting",
        description:
          "Survey of a habitation to fix installation points with the gram panchayat, accounting for shading, footfall and the locations the panchayat considers unsafe after dark.",
        categories: ["Survey", "Rural electrification"],
        tags: ["survey", "siting", "panchayat"],
        sectors: ["Rural development", "Panchayati raj"],
      },
      {
        kind: "SERVICE",
        name: "Multi-year maintenance and storage replacement",
        description:
          "A contracted maintenance obligation covering fault attendance, driver replacement and scheduled replacement of electrochemical storage across the contract period.",
        categories: ["Operations and maintenance"],
        tags: ["maintenance", "storage replacement", "field service"],
        sectors: ["Energy", "Rural development"],
      },
    ],
    experience: [
      {
        title: "Autonomous electrification of 3,180 habitation points across four districts",
        clientName: "Maharashtra Energy Development Agency",
        clientType: "STATE_GOVERNMENT",
        sector: "Rural development",
        description:
          "Survey, supply, installation and five-year maintenance of 3,180 autonomous photovoltaic illumination units across 412 gram panchayats in four districts, including the storage replacement obligation.",
        outcome:
          "96 per cent of installations functioning at the fourth-year audit against a contractual threshold of 90 per cent.",
        contractValueInr: 214_000_000,
        startYear: 2019,
        endYear: 2024,
      },
      {
        title: "Renewable power and illumination for 96 tribal hamlets",
        clientName: "Zilla Parishad, Betul",
        clientType: "STATE_GOVERNMENT",
        sector: "Panchayati raj",
        description:
          "Autonomous photovoltaic installations at 96 tribal hamlets beyond the distribution network, with community operator training in each hamlet.",
        outcome:
          "All 96 hamlets had usable power after dark for the first time; trained operators handled 61 per cent of faults without a technician visit.",
        contractValueInr: 41_500_000,
        startYear: 2021,
        endYear: 2023,
      },
      {
        title: "Storage replacement programme across 7,100 installed units",
        clientName: "Maharashtra Energy Development Agency",
        clientType: "STATE_GOVERNMENT",
        sector: "Energy",
        description:
          "A standing obligation to replace electrochemical storage across the installed base on a condition-assessed schedule rather than a fixed one.",
        outcome:
          "Mean functioning life of an installation extended from 3.1 to 8.4 years across the programme.",
        contractValueInr: 88_000_000,
        startYear: 2022,
        endYear: null,
      },
    ],
    credentials: [
      {
        kind: "CERTIFICATION",
        name: "ISO 9001:2015",
        issuingAuthority: "TUV Rheinland India",
      },
      {
        kind: "QUALITY_STANDARD",
        name: "IS 16221 photovoltaic module conformity",
        issuingAuthority: "Bureau of Indian Standards",
      },
      {
        kind: "EMPANELMENT",
        name: "Empanelled supplier, decentralised renewable systems",
        issuingAuthority: "Maharashtra Energy Development Agency",
      },
      {
        kind: "EMPANELMENT",
        name: "GeM registered seller",
        issuingAuthority: "Government e-Marketplace",
      },
    ],
  },
];
