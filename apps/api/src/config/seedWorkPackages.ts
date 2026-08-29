/**
 * A confirmed, decomposed procurement project for demonstrating work-package
 * vendor matching.
 *
 * The point of matching per package rather than per project is that one project
 * can contain unrelated procurements, and the right supplier for one is not the
 * right supplier for another. So this project deliberately contains packages
 * from five different domains: the ranking each produces should have almost
 * nothing in common, and a demo where the same suppliers surfaced for all five
 * would demonstrate nothing at all.
 *
 * The packages are written the way a department would write them, not reverse
 * engineered from the seeded supplier profiles. Where a supplier is found only
 * by semantic retrieval, that is because their capability statement genuinely
 * uses different words for the same work — not because the package text was
 * arranged to produce that result.
 */

export interface SeedWorkPackageRequirement {
  kind: "REQUIREMENT" | "CONSTRAINT";
  category: "FUNCTIONAL" | "NON_FUNCTIONAL" | "BUDGET" | "TIMELINE" | "COMPLIANCE" | "OTHER";
  text: string;
}

export interface SeedWorkPackage {
  packageNumber: string;
  title: string;
  description: string;
  scope: string;
  complexity: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  estimatedCategory: string;
  deliverables: string[];
  /** CONFIRMED packages are matchable; the others prove the gate holds. */
  status: "CONFIRMED" | "UNDER_REVIEW";
  displayOrder: number;
  requirements: SeedWorkPackageRequirement[];
}

export interface SeedDecomposedProject {
  referenceNumber: string;
  organizationCode: string;
  title: string;
  problemDescription: string;
  workPackages: SeedWorkPackage[];
}

export const SEEDED_DECOMPOSED_PROJECTS: readonly SeedDecomposedProject[] = [
  {
    referenceNumber: "PRJ-2026-0201",
    organizationCode: "DEPT-INFRA",
    title: "Integrated rural development programme for Dindori and Chandwad blocks",
    problemDescription:
      "A consolidated sanction covering fourteen gram panchayats across two blocks. The programme was approved as a single outlay but comprises unrelated procurements: road and drainage works, village lighting, ward-level waste handling, a supplementary nutrition supply line for anganwadi centres, and a monitoring system that ties the four together for the district administration. The department requires each component contracted separately, since no single supplier is capable across all of them, and the sequencing is such that lighting and waste handling cannot begin until the road works reach a defined stage.",
    workPackages: [
      {
        packageNumber: "WP-01",
        title: "Upgrading of 22 km of inter-village roads with cross drainage works",
        description:
          "Reconstruction of nine inter-village road links totalling 22 km to a bituminous surface, together with the cross drainage works needed to stop the seasonal closures that currently cut off six habitations for most of the monsoon. Four existing culverts have failed and require reconstruction.",
        scope:
          "Earthwork, granular sub-base and wet mix macadam layers, bituminous surfacing to departmental specification, reconstruction of four failed culverts, construction of side drains through habitation stretches, and provision of road furniture. The contractor is responsible for field quality control including field density, bitumen content and layer thickness measurement for every completed stretch, recorded to departmental format. Work must be sequenced so that no habitation is without vehicle access for more than four consecutive days.",
        complexity: "HIGH",
        priority: "CRITICAL",
        estimatedCategory: "Civil Works and Road Construction",
        deliverables: [
          "22 km of bituminous road surface across nine links",
          "Four reconstructed culverts",
          "Side drainage through habitation stretches",
          "Field quality control records for every completed stretch",
          "As-built drawings and completion certificate",
        ],
        status: "CONFIRMED",
        displayOrder: 1,
        requirements: [
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Upgrade 22 km across nine inter-village road links to a bituminous surface conforming to departmental specification." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Reconstruct four failed culverts and construct side drainage sufficient to prevent seasonal closure." },
          { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The contractor must hold a valid PWD registration of Class I or equivalent for road works in the state." },
          { kind: "CONSTRAINT", category: "TIMELINE", text: "All road works must reach the surfacing stage within one pre-monsoon working window of sixteen weeks." },
          { kind: "CONSTRAINT", category: "BUDGET", text: "The sanctioned outlay for this package is ₹9.8 crore inclusive of all taxes and cess." },
        ],
      },

      {
        packageNumber: "WP-02",
        title: "Solar powered street lighting for fourteen gram panchayats",
        description:
          "Supply, installation and five-year maintenance of 1,240 standalone solar street lighting units across fourteen gram panchayats. The habitations have no reliable grid supply after dusk, and the existing conventional fittings on the few electrified poles have been non-functional for two years because the panchayats cannot meet the recurring energy bill.",
        scope:
          "Supply of standalone photovoltaic street lighting units comprising panel, battery, LED luminaire and pole, installation at surveyed locations, commissioning, and a five-year comprehensive maintenance obligation including battery replacement. The supplier must survey and fix pole locations with the panchayat before installation, and must train two persons per panchayat in first-level fault identification.",
        complexity: "MEDIUM",
        priority: "HIGH",
        estimatedCategory: "Renewable Energy and Electrical Works",
        deliverables: [
          "1,240 commissioned standalone solar street lighting units",
          "Location survey and pole schedule agreed with each panchayat",
          "Five-year comprehensive maintenance including battery replacement",
          "Two trained fault-identification personnel per panchayat",
        ],
        status: "CONFIRMED",
        displayOrder: 2,
        requirements: [
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Supply and commission 1,240 standalone solar photovoltaic street lighting units with integrated battery storage and LED luminaires." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Each unit must provide illumination for a minimum of eleven hours after a single day of charging under monsoon cloud cover." },
          { kind: "CONSTRAINT", category: "COMPLIANCE", text: "All supplied luminaires and photovoltaic modules must carry mandatory BIS certification and the supplier must hold ISO 9001 certification." },
          { kind: "CONSTRAINT", category: "BUDGET", text: "The sanctioned outlay for this package is ₹4.6 crore." },
        ],
      },

      {
        packageNumber: "WP-03",
        title: "Ward level organic fraction diversion and dry material sorting infrastructure",
        description:
          "Establishment and three-year operation of fourteen small composting and dry material sorting yards, one per gram panchayat, to keep the organic and recyclable fractions of village refuse out of the open dumping grounds now in use at the edge of each habitation. The panchayats have no capacity to run a centralised facility and no budget for one.",
        scope:
          "Site preparation and construction of a covered sorting shed and composting bays at fourteen locations, supply of sorting and shredding equipment, three years of operation with a resident team at each site, and structured handover to panchayat sanitation staff at the end of the operating period. The operator is responsible for characterisation of the incoming stream at each site in the first quarter and for a quarterly reconciliation of diverted tonnage against panchayat collection records.",
        complexity: "MEDIUM",
        priority: "HIGH",
        estimatedCategory: "Environmental Services and Sanitation",
        deliverables: [
          "Fourteen constructed sorting and composting yards",
          "Characterisation study of the incoming stream per site",
          "Three years of operation with resident teams",
          "Quarterly diverted-tonnage reconciliation",
          "Documented handover and training of panchayat sanitation staff",
        ],
        status: "CONFIRMED",
        displayOrder: 3,
        requirements: [
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Construct and operate fourteen ward-level yards for composting the organic fraction and sorting the dry recyclable fraction of village refuse." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Divert not less than 60 per cent of incoming tonnage from the existing open dumping grounds within the first operating year." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Train panchayat sanitation staff to operate each yard independently before handover at the end of the third year." },
          { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The operator must hold a valid authorisation from the State Pollution Control Board for the handling of municipal solid waste." },
          { kind: "CONSTRAINT", category: "BUDGET", text: "The sanctioned outlay for this package is ₹3.2 crore over three years." },
        ],
      },

      {
        packageNumber: "WP-04",
        title: "Supply of fresh vegetables and fruit to 214 anganwadi centres",
        description:
          "A three-year supply line delivering fresh vegetables and fruit to 214 anganwadi centres across the two blocks for the supplementary nutrition programme. Current supply is through block-level traders, arrives twice a week irrespective of the menu, and roughly a fifth of each consignment is rejected at the centre as unfit.",
        scope:
          "Supply of fresh vegetables and fruit against a weekly indent from each centre, delivered on a schedule matched to the supplementary nutrition menu. The supplier is responsible for grading to the specified size and quality standard, for cold handling between despatch and delivery where the commodity requires it, and for a documented rejection and replacement procedure. Delivery is to the centre, not to a block point. Residue testing on a sampled basis is required quarterly.",
        complexity: "MEDIUM",
        priority: "HIGH",
        estimatedCategory: "Food and Nutrition Supply",
        deliverables: [
          "Weekly indent-based delivery to 214 anganwadi centres",
          "Graded commodity meeting the specified size and quality standard",
          "Documented rejection and replacement procedure",
          "Quarterly sampled residue test reports",
        ],
        status: "CONFIRMED",
        displayOrder: 4,
        requirements: [
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Deliver fresh vegetables and fruit to 214 anganwadi centres against a weekly indent matched to the supplementary nutrition menu." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Grade all commodity to the specified size and quality standard before despatch, with cold handling where the commodity requires it." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Operate a documented rejection and replacement procedure with replacement within one working day." },
          { kind: "CONSTRAINT", category: "COMPLIANCE", text: "The supplier must hold a valid FSSAI licence for the storage and distribution of fresh commodity." },
          { kind: "CONSTRAINT", category: "BUDGET", text: "The sanctioned outlay for this package is ₹2.9 crore over three years." },
        ],
      },

      {
        packageNumber: "WP-05",
        title: "Programme monitoring dashboard for the district administration",
        description:
          "A monitoring system tying the four physical components of the programme to a single view for the district administration, drawing progress from field entries made by the block programme staff rather than from contractor self-reporting.",
        scope:
          "A web application with a mobile field-entry capability, role-based access for block and district staff, geotagged progress capture against each work package, and a district dashboard with exception reporting. Hosting is on the state data centre. The supplier is responsible for training block staff and for one year of support after go-live.",
        complexity: "MEDIUM",
        priority: "MEDIUM",
        estimatedCategory: "Software and Digital Systems",
        deliverables: [
          "Web application with role-based access",
          "Mobile field-entry capability with geotagged progress capture",
          "District dashboard with exception reporting",
          "Block staff training and one year of post-go-live support",
        ],
        // Deliberately left unconfirmed. Matching this package must be refused:
        // it demonstrates that suppliers are never put in front of an official
        // against requirements the department has not yet agreed.
        status: "UNDER_REVIEW",
        displayOrder: 5,
        requirements: [
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide a web application with mobile field entry and geotagged progress capture against each work package." },
          { kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Provide a district dashboard with exception reporting for delayed or stalled work." },
          { kind: "CONSTRAINT", category: "NON_FUNCTIONAL", text: "The application must be hosted on the state data centre and must not require an external cloud dependency." },
        ],
      },
    ],
  },
];
