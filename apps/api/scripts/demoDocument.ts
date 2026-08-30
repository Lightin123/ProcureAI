/**
 * Synthetic compliance documents for demonstration suppliers.
 *
 * The document system stores real bytes on disk and checks the declared MIME
 * type against the file's own leading bytes, so a seeded supplier cannot be
 * given a document row without a file behind it. Rather than shipping binary
 * fixtures into the repository, this module writes a small, genuinely valid
 * single-page PDF at seed time.
 *
 * Every page it produces is stamped, in its first line, as demonstration data.
 * Nothing here contains, or is derived from, a real person, a real certificate
 * or a real registration: the identifiers a caller passes in are fictional and
 * the issuing bodies are named generically.
 *
 * The output is deterministic for a given set of lines, so re-seeding writes
 * identical bytes rather than a slightly different file each run.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT_MARGIN = 56;
const TOP = 780;
const LINE_HEIGHT = 18;

/** PDF string literals escape backslashes and both parentheses. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Keeps a line inside the page. Helvetica at 11pt averages ~5.5pt per glyph. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length > maxChars) {
      if (current !== "") lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current !== "") lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

export interface DemoDocumentLine {
  text: string;
  /** Rendered larger and bolder-looking. Used for the title and the stamp. */
  emphasis?: boolean;
}

/**
 * Builds a one-page PDF containing the given lines.
 *
 * Returns the raw bytes; the caller base64-encodes them for `storeDocument`,
 * which is the single module allowed to write an upload to disk.
 */
export function buildDemoPdf(lines: readonly DemoDocumentLine[]): Buffer {
  const content: string[] = ["BT"];
  let y = TOP;

  for (const line of lines) {
    const size = line.emphasis === true ? 14 : 11;
    const maxChars = line.emphasis === true ? 62 : 82;

    for (const wrapped of wrap(line.text, maxChars)) {
      content.push(`/F1 ${size} Tf`);
      content.push(`1 0 0 1 ${LEFT_MARGIN} ${y} Tm`);
      content.push(`(${escapeText(wrapped)}) Tj`);
      y -= line.emphasis === true ? LINE_HEIGHT + 6 : LINE_HEIGHT;
    }
  }

  content.push("ET");
  const stream = content.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];

  // The cross-reference table needs each object's byte offset, so the file is
  // assembled once, measuring as it goes, rather than concatenated and patched.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

export interface DemoDocumentSpec {
  documentType: string;
  title: string;
  organizationName: string;
  referenceNumber: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  /** Two or three lines of body text describing what the document attests. */
  body: readonly string[];
}

/**
 * The page a seeded compliance document contains.
 *
 * Written to look like the certificate it stands in for — issuing body, holder,
 * reference, dates — while stating in its first and last lines that it is
 * demonstration data. Anyone who opens one in the administrator's review screen
 * should be in no doubt about what they are looking at.
 */
export function buildComplianceDocument(spec: DemoDocumentSpec): Buffer {
  return buildDemoPdf([
    { text: "DEMONSTRATION DATA — NOT A GENUINE CERTIFICATE", emphasis: true },
    { text: "" },
    { text: spec.title, emphasis: true },
    { text: "" },
    { text: `Issued to: ${spec.organizationName}` },
    { text: `Document type: ${spec.documentType.replace(/_/g, " ").toLowerCase()}` },
    {
      text: `Reference: ${spec.referenceNumber ?? "Not applicable to this document type"}`,
    },
    { text: `Date of issue: ${spec.issuedOn ?? "Not stated"}` },
    { text: `Valid until: ${spec.validUntil ?? "No stated expiry"}` },
    { text: "" },
    ...spec.body.map((text) => ({ text })),
    { text: "" },
    {
      text:
        "This page was generated by the ProcureAI seed script for demonstration and testing. " +
        "It records no real organisation, no real individual and no real registration. It " +
        "carries no legal effect and must not be relied upon as evidence of any credential.",
    },
  ]);
}
