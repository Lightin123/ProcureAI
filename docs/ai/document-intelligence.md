# Document Intelligence

**Status:** Planned / future idea. Not implemented, not yet designed in
detail.

## Purpose

Extract structured information from documents submitted by vendors during
the RFI/proposal collection step (FR5/FR6 in
[../product/requirements.md](../product/requirements.md)), so that the
extracted data can feed into evaluation (see
[evaluation-and-ranking.md](evaluation-and-ranking.md)) without requiring an
official to manually re-key document contents.

## Envisioned Capabilities (Not Yet Designed)

- Parsing uploaded documents (format(s) unresolved — likely PDF at minimum).
- Extracting structured fields relevant to evaluation criteria (pricing,
  timeline commitments, compliance claims, team/experience details).
- Flagging extraction confidence / missing expected fields, consistent with
  the "AI output must be validated" principle — see
  [ai-system.md](ai-system.md).

## Explicitly Not Yet Decided

- Document formats supported.
- File storage mechanism (local filesystem vs. object storage) — see open
  question U9 in [../architecture/decisions.md](../architecture/decisions.md).
- Extraction technique (LLM-based extraction vs. traditional OCR/parsing
  vs. hybrid).
- Whether this capability is in hackathon scope at all — RFI/proposal
  collection and document intelligence are later stages of the workflow and
  may be simplified or stubbed for a demo. See
  [../product/hackathon-scope.md](../product/hackathon-scope.md).

## Related Documents

- [ai-system.md](ai-system.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
