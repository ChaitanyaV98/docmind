/**
 * Split a document into overlapping chunks for embedding.
 *
 * Strategy (structure-aware, character-budgeted):
 *  1. Split on markdown headings so a chunk never straddles two sections, and remember the
 *     heading so citations can say *where* in the document an answer came from.
 *  2. Within a section, greedily pack paragraphs up to `maxChars`.
 *  3. A paragraph that is itself too long is split by sentences, then hard-split as a last resort.
 *  4. Each chunk starts with the tail of the previous one (`overlap`) so a fact that spans a
 *     boundary is still retrievable from either side.
 *
 * ~1200 chars ≈ 300 tokens: small enough to be specific, big enough to carry context.
 */
export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

export interface TextChunk {
  index: number;
  heading: string | null;
  content: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlap ?? 200;
  if (overlap >= maxChars) throw new Error("overlap must be smaller than maxChars");

  const chunks: TextChunk[] = [];
  for (const section of splitSections(text)) {
    const pieces = packParagraphs(section.body, maxChars - overlap);
    pieces.forEach((piece, i) => {
      const prefix = i > 0 ? tail(pieces[i - 1], overlap) : "";
      const content = (prefix ? `${prefix} ${piece}` : piece).trim();
      if (content) chunks.push({ index: chunks.length, heading: section.heading, content });
    });
  }
  return chunks;
}

interface Section {
  heading: string | null;
  body: string;
}

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  const trail: string[] = []; // heading path, e.g. ["Expense Policy", "Travel"]
  let lines: string[] = [];

  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ heading: trail.filter(Boolean).join(" › ") || null, body });
    lines = [];
  };

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      trail.length = level; // drop deeper headings from the previous section
      trail[level - 1] = m[2];
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function packParagraphs(body: string, budget: number): string[] {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > budget ? splitLong(p, budget) : [p]));

  const out: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + 1 + p.length > budget) {
      out.push(current);
      current = p;
    } else {
      current = current ? `${current}\n${p}` : p;
    }
  }
  if (current) out.push(current);
  return out;
}

function splitLong(paragraph: string, budget: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length > budget) {
      if (current) out.push(current);
      current = "";
      for (let i = 0; i < s.length; i += budget) out.push(s.slice(i, i + budget));
      continue;
    }
    if (current && current.length + 1 + s.length > budget) {
      out.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Last `n` characters, trimmed forward to a word boundary so we don't start mid-word. */
function tail(s: string, n: number): string {
  if (s.length <= n) return s;
  const slice = s.slice(-n);
  const firstSpace = slice.search(/\s/);
  return firstSpace === -1 ? slice : slice.slice(firstSpace + 1);
}
