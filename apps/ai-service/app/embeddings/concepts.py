"""Procurement domain concept lexicon.

This is the vocabulary that lets the local embedding model relate wording that
does not overlap. "Horticultural produce" and "fresh agricultural vegetables"
share no useful token, but both land in AGRICULTURE, so a vector built over
concepts rather than words puts them next to each other — which is the entire
reason semantic retrieval exists alongside the lexical matcher.

Each concept is a set of surface forms observed in Indian public procurement
documents and in supplier capability statements. Membership is deliberately
generous within a concept and strict between concepts: a term that would pull
two unrelated domains together (``system``, ``service``, ``management``) belongs
in no concept at all and is filtered out before this map is consulted.
"""

from __future__ import annotations

# Concept order is load-bearing: it fixes which vector dimension a concept owns,
# so appending is safe and reordering invalidates every stored embedding. The
# embedding version in ``local_provider`` must be bumped if this list changes.
CONCEPT_LEXICON: dict[str, tuple[str, ...]] = {
    "AGRICULTURE": (
        "agriculture", "agricultural", "agri", "agro", "farm", "farming", "farmer",
        "crop", "cropping", "cultivation", "cultivate", "horticulture", "horticultural",
        "produce", "vegetable", "vegetables", "fruit", "fruits", "grain", "grains",
        "cereal", "pulses", "millet", "paddy", "wheat", "harvest", "harvesting",
        "postharvest", "seed", "seeds", "fertiliser", "fertilizer", "pesticide",
        "agronomy", "plantation", "orchard", "nursery", "floriculture", "mandi",
        "procurement-of-produce", "perishable", "perishables", "food", "foodgrain",
    ),
    "COLD_CHAIN": (
        "cold", "coldchain", "refrigerated", "refrigeration", "chilled", "freezer",
        "frozen", "temperature-controlled", "reefer", "warehouse", "warehousing",
        "storage", "godown", "silo", "preservation", "shelflife", "ripening",
    ),
    "WASTE_MANAGEMENT": (
        "waste", "wastes", "garbage", "refuse", "rubbish", "trash", "litter",
        "segregation", "segregated", "sorting", "recycling", "recycled", "recyclable",
        "compost", "composting", "vermicompost", "landfill", "dumpsite", "dumping",
        "incineration", "biomethanation", "material-recovery", "mrf", "scrap",
        "sanitation", "sweeping", "collection", "disposal", "leachate", "bioremediation",
        "legacy-waste", "plastic", "biomedical", "wastetoenergy",
    ),
    "WATER_SANITATION": (
        "water", "drinking-water", "potable", "borewell", "tubewell", "aquifer",
        "groundwater", "pipeline", "pipelines", "distribution-network", "overhead-tank",
        "sump", "desalination", "purification", "filtration", "chlorination", "sewage",
        "sewerage", "septic", "faecal", "sludge", "effluent", "stp", "etp", "toilet",
        "latrine", "drainage", "drain", "stormwater", "rainwater", "harvesting-structure",
        "irrigation", "canal", "watershed", "pond", "lake", "rejuvenation",
    ),
    "ENERGY_RENEWABLE": (
        "solar", "photovoltaic", "pv", "renewable", "wind", "turbine", "biogas",
        "biomass", "hydro", "energy", "power", "electricity", "grid", "offgrid",
        "microgrid", "inverter", "battery", "storage-system", "kilowatt", "megawatt",
        "rooftop", "netmetering", "electrification", "generation", "substation",
        "transformer", "transmission", "distribution-line", "feeder",
    ),
    "LIGHTING": (
        "lighting", "light", "lights", "luminaire", "streetlight", "streetlighting",
        "lamp", "lamps", "led", "illumination", "pole", "poles", "mast", "highmast",
        "photocell", "dimming",
    ),
    "ROAD_CIVIL": (
        "road", "roads", "roadway", "highway", "carriageway", "pavement", "bitumen",
        "bituminous", "asphalt", "concrete", "cement", "wbm", "gsb", "kerb", "culvert",
        "bridge", "flyover", "embankment", "earthwork", "excavation", "civil",
        "construction", "constructed", "building", "buildings", "structure",
        "structural", "foundation", "masonry", "reinforcement", "rcc", "shuttering",
        "resurfacing", "widening", "blacktopping", "footpath", "pedestrian",
    ),
    "URBAN_INFRASTRUCTURE": (
        "urban", "municipal", "municipality", "corporation", "ward", "township",
        "smartcity", "streetscape", "park", "parks", "playground", "landscaping",
        "beautification", "amenity", "amenities", "publicspace", "market-complex",
        "busstop", "shelter", "signage", "boundary-wall", "fencing",
    ),
    "RURAL_DEVELOPMENT": (
        "rural", "village", "villages", "panchayat", "gram", "block", "tribal",
        "habitation", "hamlet", "livelihood", "selfhelp", "shg", "mgnrega",
        "watershed-development", "rurban",
    ),
    "HEALTHCARE": (
        "health", "healthcare", "hospital", "clinic", "dispensary", "phc", "chc",
        "medical", "medicine", "medicines", "pharmaceutical", "drug", "drugs",
        "diagnostic", "diagnostics", "pathology", "laboratory", "radiology", "imaging",
        "surgical", "patient", "nursing", "ambulance", "telemedicine", "immunisation",
        "immunization", "vaccine", "vaccination", "maternal", "paediatric", "pediatric",
        "epidemiology", "screening", "wellness", "ayush",
    ),
    "EDUCATION_TRAINING": (
        "education", "educational", "school", "schools", "college", "university",
        "student", "students", "teacher", "teachers", "classroom", "curriculum",
        "pedagogy", "learning", "elearning", "training", "trainer", "skilling",
        "upskilling", "vocational", "iti", "apprenticeship", "capacity-building",
        "workshop", "certification-course", "literacy", "anganwadi", "midday",
    ),
    "SOFTWARE_PLATFORM": (
        "software", "application", "applications", "platform", "portal", "webapp",
        "web", "website", "mobile", "android", "ios", "api", "backend", "frontend",
        "database", "saas", "cloud", "hosting", "server", "microservice", "integration",
        "middleware", "workflow-automation", "erp", "crm", "dashboard", "module",
        "customisation", "customization", "deployment", "devops", "opensource",
    ),
    "DATA_ANALYTICS": (
        "data", "dataset", "analytics", "analysis", "statistical", "statistics",
        "visualisation", "visualization", "businessintelligence", "reporting-engine",
        "warehouse-data", "etl", "pipeline-data", "modelling", "modeling", "forecasting",
        "prediction", "predictive", "insight", "insights", "metrics", "kpi",
    ),
    "ARTIFICIAL_INTELLIGENCE": (
        "artificial", "intelligence", "machinelearning", "deeplearning", "neural",
        "algorithm", "algorithms", "automation", "chatbot", "nlp", "computervision",
        "recognition", "classification", "recommendation", "llm", "genai", "ocr",
    ),
    "CYBERSECURITY": (
        "cybersecurity", "cyber", "security-information", "infosec", "encryption",
        "firewall", "vapt", "penetration", "vulnerability", "authentication",
        "authorisation", "authorization", "audit-security", "soc", "siem", "threat",
        "intrusion", "malware", "privacy", "dataprotection",
    ),
    "NETWORKING_TELECOM": (
        "network", "networking", "connectivity", "broadband", "fibre", "fiber", "optic",
        "wifi", "wireless", "telecom", "telecommunication", "bandwidth", "router",
        "switch", "lan", "wan", "vpn", "tower", "spectrum", "5g", "leased-line",
    ),
    "IOT_SENSORS": (
        "iot", "sensor", "sensors", "sensing", "telemetry", "scada", "plc", "actuator",
        "embedded", "microcontroller", "gateway-device", "remote-monitoring", "rfid",
        "smartmeter", "meter", "metering", "datalogger", "instrumentation",
    ),
    "SURVEILLANCE_SECURITY": (
        "surveillance", "cctv", "camera", "cameras", "videowall", "commandcentre",
        "commandcenter", "monitoring-centre", "accesscontrol", "biometric", "guard",
        "guarding", "patrol", "alarm", "perimeter", "anpr", "facial",
    ),
    "TRANSPORT_MOBILITY": (
        "transport", "transportation", "mobility", "vehicle", "vehicles", "fleet",
        "bus", "buses", "truck", "trucks", "traffic", "junction", "signal", "parking",
        "railway", "metro", "commuter", "passenger", "route", "routing", "gps",
        "vehicletracking", "electricvehicle", "charging-station", "lastmile",
    ),
    "LOGISTICS_SUPPLY": (
        "logistics", "supplychain", "distribution", "dispatch", "freight", "haulage",
        "consignment", "inventory", "stock", "procurement-logistics", "packaging",
        "packing", "loading", "unloading", "transit", "delivery-network", "depot",
    ),
    "MANUFACTURING": (
        "manufacturing", "manufacture", "manufactured", "fabrication", "fabricated",
        "production", "assembly", "machining", "tooling", "moulding", "molding",
        "casting", "welding", "extrusion", "plant-manufacturing", "factory",
        "industrial", "engineering", "machinery", "equipment", "component",
        "components", "spare", "spares",
    ),
    "TEXTILE_APPAREL": (
        "textile", "textiles", "fabric", "garment", "garments", "apparel", "uniform",
        "uniforms", "stitching", "tailoring", "yarn", "cotton", "weaving", "knitting",
        "handloom", "khadi", "dyeing",
    ),
    "FURNITURE_FIXTURES": (
        "furniture", "furnishing", "desk", "desks", "bench", "benches", "chair",
        "chairs", "table", "tables", "cupboard", "almirah", "rack", "racks", "shelving",
        "carpentry", "woodwork", "modular",
    ),
    "ENVIRONMENT_CLIMATE": (
        "environment", "environmental", "ecology", "ecological", "climate", "carbon",
        "emission", "emissions", "pollution", "pollutant", "airquality", "greenhouse",
        "sustainability", "sustainable", "biodiversity", "conservation", "afforestation",
        "plantation-tree", "greencover", "wetland", "impact-assessment",
    ),
    "MINING_MINERALS": (
        "mining", "mine", "mineral", "minerals", "quarry", "quarrying", "aggregate",
        "crusher", "borehole", "geological", "geology", "drilling", "blasting", "ore",
    ),
    "CONSULTING_ADVISORY": (
        "consulting", "consultancy", "consultant", "advisory", "advisor", "feasibility",
        "detailedproject", "dpr", "study", "assessment", "appraisal", "diagnostic-study",
        "strategy", "strategic", "policy", "framework-design", "evaluation-study",
        "monitoring-evaluation", "baseline", "survey", "surveying",
    ),
    "SURVEY_MAPPING": (
        "gis", "geospatial", "mapping", "cartography", "topographic", "cadastral",
        "drone", "uav", "lidar", "photogrammetry", "satellite", "remotesensing",
        "imagery", "coordinate", "geotagging", "landrecord", "demarcation",
    ),
    "FACILITY_MANAGEMENT": (
        "housekeeping", "cleaning", "janitorial", "pestcontrol", "maintenance",
        "upkeep", "caretaking", "facility", "facilities", "operationsmaintenance",
        "amc", "repair", "servicing", "groundskeeping", "horticulture-maintenance",
    ),
    "CATERING_NUTRITION": (
        "catering", "canteen", "kitchen", "cooking", "meal", "meals", "nutrition",
        "nutritional", "diet", "dietary", "supplementary", "ration", "fortification",
        "fortified", "hygiene-food",
    ),
    "FINANCIAL_SERVICES": (
        "financial", "finance", "accounting", "audit-financial", "banking", "payment",
        "payments", "disbursement", "subsidy", "insurance", "actuarial", "treasury",
        "taxation", "billing", "invoicing", "reconciliation", "fintech", "microfinance",
    ),
    "LEGAL_COMPLIANCE": (
        "legal", "statutory", "regulatory", "regulation", "licensing", "litigation",
        "arbitration", "contractdrafting", "duediligence", "governance-legal",
    ),
    "MEDIA_COMMUNICATION": (
        "media", "communication", "outreach", "awareness", "campaign", "publicity",
        "advertising", "branding", "creative", "content", "video", "photography",
        "printing", "publishing", "graphic", "design-creative", "translation",
        "documentation-media", "socialmedia", "iec",
    ),
    "RESEARCH_INNOVATION": (
        "research", "innovation", "innovative", "prototype", "pilot", "incubation",
        "startup", "patent", "intellectualproperty", "laboratory-research",
        "experimental", "development-rd", "proofofconcept",
    ),
    "DISASTER_RESILIENCE": (
        "disaster", "emergency", "resilience", "resilient", "flood", "cyclone",
        "earthquake", "landslide", "drought", "relief", "rescue", "evacuation",
        "earlywarning", "preparedness", "mitigation", "firefighting", "firesafety",
    ),
    "SPORTS_RECREATION": (
        "sports", "sporting", "stadium", "gymnasium", "athletic", "recreation",
        "recreational", "swimming", "court", "turf", "fitness", "playfield",
    ),
    "TOURISM_HERITAGE": (
        "tourism", "tourist", "heritage", "monument", "museum", "archaeological",
        "conservation-heritage", "restoration", "cultural", "pilgrimage", "hospitality",
    ),
}

CONCEPT_NAMES: tuple[str, ...] = tuple(CONCEPT_LEXICON.keys())

CONCEPT_INDEX: dict[str, int] = {name: index for index, name in enumerate(CONCEPT_NAMES)}


def _build_term_map() -> dict[str, tuple[int, ...]]:
    """Inverts the lexicon into term -> concept indices.

    A term may belong to more than one concept (``storage`` is both cold chain
    and energy), and that ambiguity is preserved rather than resolved: the term
    contributes to every concept it belongs to, so an ambiguous word pulls the
    vector towards both domains instead of being arbitrarily assigned to one.
    """
    mapping: dict[str, list[int]] = {}
    for name, terms in CONCEPT_LEXICON.items():
        index = CONCEPT_INDEX[name]
        for term in terms:
            mapping.setdefault(term, []).append(index)
            # Hyphenated surface forms are also stored unhyphenated, because the
            # tokeniser splits some sources on punctuation and not others.
            if "-" in term:
                mapping.setdefault(term.replace("-", ""), []).append(index)
    return {term: tuple(sorted(set(indices))) for term, indices in mapping.items()}


TERM_TO_CONCEPTS: dict[str, tuple[int, ...]] = _build_term_map()


def concepts_for_token(token: str) -> tuple[int, ...]:
    """Concept dimensions a single token contributes to.

    Falls back to a prefix rule for the common Indian-English morphology the
    lexicon does not spell out (``recycling`` / ``recycled`` are both listed,
    but ``recyclables`` is not). The prefix must be at least six characters, so
    short words cannot collide their way into a concept.
    """
    direct = TERM_TO_CONCEPTS.get(token)
    if direct is not None:
        return direct

    if len(token) < 7:
        return ()

    for length in range(len(token) - 1, 5, -1):
        stem = token[:length]
        candidate = TERM_TO_CONCEPTS.get(stem)
        if candidate is not None:
            return candidate

    return ()
