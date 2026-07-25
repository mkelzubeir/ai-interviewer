const maxPdfBytes = 5 * 1024 * 1024;

export function validateResumePdf(file: Pick<File, "type" | "name" | "size">): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return "Choose a PDF file for your resume.";
  if (file.size > maxPdfBytes) return "Choose a PDF smaller than 5 MB.";
  if (file.size === 0) return "That PDF is empty. Choose another file.";
  return null;
}

export async function extractResumePdfText(file: File): Promise<string> {
  const issue = validateResumePdf(file);
  if (issue) throw new Error(issue);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const content = await (await document.getPage(index + 1)).getTextContent();
    return content.items.map((item) => "str" in item ? item.str : "").join(" ");
  }));
  const text = pages.join("\n\n").replace(/\s{2,}/g, " ").trim();
  if (!text) throw new Error("No selectable text was found. This may be a scanned PDF; paste the resume text instead.");
  return text;
}
