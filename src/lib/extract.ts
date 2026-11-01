import { extractText, getDocumentProxy } from "unpdf";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB (server action limit is 10 MB incl. overhead)
export const ACCEPTED_EXTENSIONS = [".pdf", ".md", ".markdown", ".txt"] as const;

export interface Extracted {
  title: string;
  text: string;
}

/** Pull plain text (markdown kept as-is) out of an uploaded file. */
export async function extractFromFile(file: File): Promise<Extracted> {
  const name = file.name;
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
    throw new Error(`Unsupported file type "${ext}". Upload a PDF, Markdown or text file.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 8 MB.");

  const baseTitle = name.slice(0, name.lastIndexOf(".")).replace(/[-_]+/g, " ").trim();

  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    // Blank line between pages so the chunker treats each page boundary as a paragraph break.
    const text = pages.map((p) => p.trim()).filter(Boolean).join("\n\n");
    if (!text) throw new Error("No text found — this PDF may be scanned images (OCR isn't supported yet).");
    return { title: baseTitle, text };
  }

  const text = await file.text();
  const h1 = /^#\s+(.+)$/m.exec(text)?.[1].trim();
  return { title: h1 ?? baseTitle, text };
}
