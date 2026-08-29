/**
 * Per-model calibration of the semantic similarity scale.
 *
 * Cosine similarity is not comparable across embedding models. A trained
 * sentence encoder places genuinely unrelated procurement text around 0.68 and
 * a strong match around 0.83, so its whole working range is a narrow band well
 * above zero. The deterministic concept model places unrelated text at 0.0 and
 * a strong match at 0.88. One threshold cannot serve both: the encoder's
 * numbers fed through the concept model's calibration would admit every
 * supplier as a candidate and score every one of them as a strong match.
 *
 * So the thresholds live here, keyed by the model that produced the vector,
 * and both the retrieval cut and the score rescaling read them. Adding a model
 * means measuring it against the corpus and adding a row — not adjusting a
 * constant somewhere in the ranking code and hoping.
 */

export interface SemanticCalibration {
  /** Minimum cosine for a vector to be retrieved as a candidate at all. */
  retrievalThreshold: number;
  /** Cosine mapped to a semantic score of 0. */
  scoreFloor: number;
  /** Cosine mapped to a semantic score of 100. */
  scoreCeiling: number;
}

interface CalibrationEntry {
  match: RegExp;
  calibration: SemanticCalibration;
}

const CALIBRATIONS: readonly CalibrationEntry[] = [
  {
    // BAAI/bge-small-en-v1.5. Measured over the seeded registry, comparing
    // every confirmed work package against every supplier: the intended match
    // scored 0.817–0.840, everything else 0.493–0.769. The floor sits just
    // below the unrelated band so ordinary suppliers score low rather than
    // middling, and the ceiling at 0.85 puts a genuine match near 100.
    match: /^BAAI\/bge-/i,
    calibration: { retrievalThreshold: 0.65, scoreFloor: 0.62, scoreCeiling: 0.85 },
  },
  {
    // The concept model separates cleanly because unrelated text shares no
    // concept dimension at all and lands at or near zero.
    match: /^local-concept/i,
    calibration: { retrievalThreshold: 0.35, scoreFloor: 0.12, scoreCeiling: 0.82 },
  },
];

/**
 * Used for a model nobody has measured — a hosted provider, or a new local
 * one. Deliberately conservative on the retrieval threshold: an uncalibrated
 * model should under-retrieve rather than flood the pool, because a missing
 * candidate is visible to the officer as a shorter list while a flooded one
 * looks like a working ranking.
 */
const UNCALIBRATED: SemanticCalibration = {
  retrievalThreshold: 0.6,
  scoreFloor: 0.55,
  scoreCeiling: 0.9,
};

export function calibrationFor(model: string | null | undefined): SemanticCalibration {
  if (model === null || model === undefined) return UNCALIBRATED;

  const entry = CALIBRATIONS.find((candidate) => candidate.match.test(model));
  return entry?.calibration ?? UNCALIBRATED;
}

/** Whether the model has measured calibration, for provenance and warnings. */
export function isCalibrated(model: string | null | undefined): boolean {
  return (
    model !== null &&
    model !== undefined &&
    CALIBRATIONS.some((candidate) => candidate.match.test(model))
  );
}
