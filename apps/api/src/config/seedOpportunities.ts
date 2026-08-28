/**
 * Demonstration procurement projects, confirmed and published to suppliers.
 *
 * Chosen so that the matching has something to distinguish: a road package
 * should surface the civil contractor and not the diagnostics manufacturer, and
 * a screening programme should do the reverse. A demo where every supplier
 * matches every opportunity would prove nothing.
 *
 * These are seeded at `REQUIREMENTS_CONFIRMED` with their requirements already
 * accepted, because the point of seeding them is the supplier-facing half of
 * the workflow; the analysis and review half is exercised live.
 */

export interface SeedRequirement {
  kind: "REQUIREMENT" | "CONSTRAINT";
  category: "FUNCTIONAL" | "NON_FUNCTIONAL" | "BUDGET" | "TIMELINE" | "COMPLIANCE" | "OTHER";
  text: string;
}

export interface SeedOpportunity {
  referenceNumber: string;
  organizationCode: string;
  title: string;
  problemDescription: string;
  opportunitySummary: string;
  /** Days from the seed run; converted to a date so the demo is never stale. */
  deadlineInDays: number | null;
  published: boolean;
  requirements: SeedRequirement[];
}

export const SEEDED_OPPORTUNITIES: readonly SeedOpportunity[] = [
  {
    referenceNumber: "PRJ-2026-0101",
    organizationCode: "DEPT-INFRA",
    title: "Upgrading of 38 km of rural connectivity roads with cross drainage works",
    problemDescription:
      "Nine road links across two blocks have deteriorated to the point where they are impassable to four-wheeled traffic for roughly eleven weeks each monsoon, cutting off fourteen habitations from the block headquarters and the nearest referral hospital. Existing cross drainage is inadequate and three culverts have failed. The department requires the links upgraded to a bituminous surface with adequate cross drainage, completed within a single pre-monsoon working window, and with quality records maintained to departmental format throughout.",
    opportunitySummary:
      "The department seeks a civil contractor to upgrade 38 km of rural connectivity roads across nine links in two blocks, including reconstruction of three failed culverts and construction of cross drainage works. The work must be completed within one pre-monsoon working window. Contractors must hold appropriate state registration, own or have committed access to paving and compaction plant, and maintain field quality records to departmental format. Prior execution of comparable rural road packages is expected.",
    deadlineInDays: 24,
    published: true,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Upgrade 38 km across nine road links to a bituminous surface conforming to departmental specification for rural connectivity roads." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Reconstruct three failed culverts and construct cross drainage works sufficient to prevent seasonal closure of the links." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Maintain field quality records including field density, bitumen content and thickness measurement for every completed stretch." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "All works must be completed within a single pre-monsoon working window of fourteen weeks from the date of the work order." },
      { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The contractor must hold valid state public works registration of Class I or equivalent and a current contract labour licence." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "The contractor must have executed at least two comparable rural road packages of not less than 15 km in the preceding five years." },
      { kind: "CONSTRAINT", category: "BUDGET", text: "The sanctioned outlay for the package is ₹16.4 crore inclusive of all taxes and cess." },
    ],
  },

  {
    referenceNumber: "PRJ-2026-0102",
    organizationCode: "DEPT-HEALTH",
    title: "Point-of-care anaemia screening capability for 480 sub-centres",
    problemDescription:
      "Anaemia screening coverage among registered pregnancies in the district's tribal blocks stands at 29 per cent. Sub-centres have no laboratory technician and, in 140 of 480 cases, no reliable mains power. Samples are referred to the block PHC, where the median turnaround is nine days and roughly half of all referred samples never produce a recorded result. The department requires screening capability placed at the sub-centre itself, usable by an ANM after short training, with the result reaching the district health record on the day it is taken.",
    opportunitySummary:
      "The department seeks a supplier able to place point-of-care haemoglobin and blood count screening capability at 480 sub-centres, a third of which have no reliable mains power. The equipment must be usable by an auxiliary nurse midwife after short training, must not require venous sampling or a laboratory, and must report results into the district health record on the day of testing. Supply must include installation, health worker training, consumable supply and a maintained calibration schedule. Devices must hold current CDSCO registration.",
    deadlineInDays: 17,
    published: true,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide haemoglobin and blood count screening capability operable at a sub-centre by an auxiliary nurse midwife following training of not more than one working day." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Equipment must operate for a full working session without mains power in the 140 locations identified as having unreliable supply." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Results must be transmitted to the district health record on the day of testing without a paper transcription step." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Consumables must be supplied on a schedule matched to expected screening volume, with a stated shelf life under field storage conditions." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "The supplier must provide installation, health worker training and a documented calibration schedule for the contract period." },
      { kind: "CONSTRAINT", category: "COMPLIANCE", text: "All supplied medical devices must hold current registration with the Central Drugs Standard Control Organisation and the manufacturer must hold ISO 13485 certification." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "Field accuracy must be demonstrated by method comparison against a reference analyser on not fewer than 500 paired samples." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "Deployment across all 480 sub-centres must be completed within nine months of the work order." },
      { kind: "CONSTRAINT", category: "BUDGET", text: "The sanctioned outlay is ₹9.6 crore including three years of consumables and maintenance." },
    ],
  },

  {
    referenceNumber: "PRJ-2026-0103",
    organizationCode: "DEPT-INFRA",
    title: "Supply of corrosion-resistant outdoor equipment enclosures for coastal substations",
    problemDescription:
      "Enclosures at 74 coastal distribution substations are failing within two to three monsoons, with visible corrosion at seams and door frames leading to water ingress and equipment failure. The current supply is powder coated over untreated steel. The department requires replacement enclosures manufactured to withstand a coastal environment, with a demonstrable pre-treatment process and a warranty against coating failure that the supplier can be held to.",
    opportunitySummary:
      "The department seeks a manufacturer of outdoor equipment enclosures for 74 coastal distribution substations. Enclosures must be rated for outdoor coastal installation with a demonstrable multi-stage pre-treatment before coating, must meet the relevant Indian Standard for enclosure conformity, and must carry a warranty against coating failure of not less than five years. Suppliers must be able to evidence the pre-treatment process in their own works rather than through a subcontractor, and must supply spares for seven years.",
    deadlineInDays: 31,
    published: true,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Supply 74 outdoor equipment enclosures rated to IP66 for coastal installation, in three size variants to be finalised at drawing approval." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Enclosures must undergo a multi-stage pre-treatment process before coating, evidenced in the manufacturer's own works." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "The supplier must hold spares including gaskets, locks and hinges available for a period of seven years from delivery." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Installation and commissioning at each substation site must be included in the scope." },
      { kind: "CONSTRAINT", category: "COMPLIANCE", text: "Enclosures must conform to IS 13947 and the manufacturer must hold ISO 9001 certification." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "The supplier must warrant against coating failure for not less than sixty months from the date of commissioning." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "Batch dimensional inspection records must be furnished with every consignment." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "Complete delivery and commissioning within twenty weeks of drawing approval." },
    ],
  },

  {
    referenceNumber: "PRJ-2026-0104",
    organizationCode: "DEPT-HEALTH",
    title: "Fresh produce supply with farm traceability for 180 residential institutions",
    problemDescription:
      "The department supplies fresh vegetables to 180 residential schools and hostels through a network of local contractors. Grade consistency varies widely between contractors, rejection at receipt runs above eight per cent, and the department has no ability to trace a consignment back beyond the contractor. Nutritional programme audits have twice raised the absence of residue testing. The department wishes to procure through a supplier able to guarantee grade, provide residue test reports per consignment, and trace produce to the farm.",
    opportunitySummary:
      "The department seeks a supplier able to deliver graded fresh vegetables twice weekly to 180 residential institutions across the district, with residue test reports for every consignment and traceability of produce to the originating farm. Suppliers must demonstrate cold chain capability from harvest to delivery, hold a central FSSAI licence, and be able to sustain volume through the full academic year including the lean season. Farmer producer organisations and cooperatives are expressly eligible.",
    deadlineInDays: 12,
    published: true,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Deliver graded fresh vegetables twice weekly to 180 residential institutions across the district throughout the academic year." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Furnish a pesticide residue test report from a recognised laboratory for every consignment." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide traceability of each consignment to the originating farm or collection centre." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Maintain a cold chain from harvest to delivery, with pre-cooling within six hours of harvest for leafy produce." },
      { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The supplier must hold a valid central FSSAI licence for the full contract period." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "Rejection at receipt must not exceed five per cent of consignment weight, measured monthly." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "The contract runs for two academic years with supply commencing within thirty days of the work order." },
      { kind: "CONSTRAINT", category: "BUDGET", text: "The estimated annual outlay is ₹4.1 crore." },
    ],
  },

  {
    referenceNumber: "PRJ-2026-0105",
    organizationCode: "DEPT-INFRA",
    title: "Decentralised municipal solid waste processing for six wards",
    problemDescription:
      "The municipal landfill is at capacity and an extension has been refused on environmental grounds. Mixed waste from six wards, amounting to roughly 90 tonnes a day, currently reaches the landfill untreated. A centralised processing plant cannot be justified at this volume and would in any case take three years to commission. The corporation wishes to establish ward-level processing capable of diverting the organic and recyclable fractions, operated initially by the supplier and handed over to municipal staff.",
    opportunitySummary:
      "The corporation seeks a supplier to design, construct and operate decentralised waste processing units across six wards handling approximately 90 tonnes per day of mixed municipal solid waste. The scope includes composting of the organic fraction, material recovery of recyclables, three years of operation, and structured training and handover of the corporation's own sanitation staff at the end of the operating period. Suppliers must hold current pollution control board consent and evidence of comparable units still operating after handover.",
    deadlineInDays: 45,
    published: true,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Design, construct and commission decentralised processing units across six wards with a combined capacity of not less than 90 tonnes per day." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Process the organic fraction to compost meeting Fertiliser Control Order specification for city compost." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Recover recyclable fractions and account for their disposal to registered recyclers." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Operate all units for three years and train the corporation's sanitation staff to operate them independently thereafter." },
      { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The supplier must hold current Consent to Operate from the state pollution control board for waste processing." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "The supplier must evidence at least three comparable decentralised units still operating at above two thirds of design throughput two years after municipal handover." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "Unit design must avoid components that cannot be sourced and replaced locally by municipal maintenance staff." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "All six units to be commissioned within nine months of site handover." },
    ],
  },

  {
    referenceNumber: "PRJ-2026-0106",
    organizationCode: "DEPT-INFRA",
    title: "Vocational skilling and placement for 4,000 candidates in construction trades",
    problemDescription:
      "Infrastructure programmes across the district report a persistent shortage of certified masons, bar benders and shuttering carpenters, while unemployment among young men in the same blocks is high. Previous skilling programmes in the district reported placement at three months but no retention data, and anecdotal reports suggest most candidates left within the first six months. The department wishes to procure skilling delivery on terms that make retention, not placement, the reported outcome.",
    opportunitySummary:
      "The department seeks a training partner to deliver NSQF-aligned vocational training and placement for 4,000 candidates across construction trades in eight blocks over two years. Payment milestones are linked to verified placement retention at twelve months rather than to placement at three. The partner must be able to deliver in blocks without a fixed training centre, must provide residential capacity for women candidates, and must be a recognised training partner of a national or state skilling body.",
    deadlineInDays: 38,
    published: true,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Deliver NSQF-aligned training and third-party assessment for 4,000 candidates across masonry, bar bending and shuttering carpentry." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide training delivery in eight blocks including those without a fixed training centre within reach." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide residential accommodation for women candidates from blocks where daily travel is not feasible." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Verify and report placement retention at twelve months against employer payroll records." },
      { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The partner must be a recognised training partner of a national or state skilling body and use NCVET-recognised awarding bodies for assessment." },
      { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "Not less than 30 per cent of candidates must be women, with completion rate reported separately by gender." },
      { kind: "CONSTRAINT", category: "OTHER", text: "Payment milestones are enrolment 20 per cent, certification 30 per cent, and verified twelve-month retention 50 per cent." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "Programme delivery over 24 months with the first batch commencing within 45 days of the work order." },
    ],
  },

  {
    referenceNumber: "PRJ-2026-0107",
    organizationCode: "DEPT-HEALTH",
    title: "Cold chain strengthening for district vaccine and diagnostic logistics",
    problemDescription:
      "Temperature excursions in the district vaccine cold chain are recorded on average eleven times a month, principally during last-mile transport to sub-centres and at two block stores with unreliable power. The department is drafting requirements for cold chain strengthening covering equipment, monitoring and transport, and has not yet finalised its position on whether transport should be procured as a service or as capital equipment.",
    opportunitySummary:
      "Requirements for this project are still under departmental review and it has not been published to suppliers.",
    deadlineInDays: null,
    published: false,
    requirements: [
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide continuous temperature monitoring with alerting across the district vaccine cold chain including last-mile transport." },
      { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide power backup sufficient to maintain storage temperature at the two block stores identified as having unreliable supply." },
      { kind: "CONSTRAINT", category: "TIMELINE", text: "Any deployment must be completed before the next intensified immunisation round." },
    ],
  },
];
