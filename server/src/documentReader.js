// Runs in a child process (see documents.js). A native crash here cannot take the server down.
import mammoth from 'mammoth';

const NOTE = 'Text extraction only: images, diagrams, formulas, and table layout are not interpreted. Review the extracted text before relying on it.';

async function readPdf(buffer, warnings) {
  // pdfjs-dist is loaded only for PDFs. pdf-parse was dropped: its native canvas module is not needed for text.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false, disableFontFace: true }).promise;
  try {
    if (pdf.numPages > 60) throw new Error('Use a PDF with at most 60 pages for this first version.');
    const parts = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      const text = content.items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join('').trim();
      parts.push({ page: number, text });
    }
    const emptyPages = parts.filter(part => !part.text).map(part => part.page);
    if (emptyPages.length) warnings.push(`No readable text on PDF pages ${emptyPages.join(', ')}. Scanned content is not read.`);
    return parts;
  } finally {
    await pdf.destroy();
  }
}

async function readDocx(buffer, warnings) {
  if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('This file is not a readable DOCX.');
  const result = await mammoth.extractRawText({ buffer });
  if (result.messages.length) warnings.push('The Word reader reported unsupported document elements. Check the extracted text.');
  return [{ page: null, text: result.value.trim() }];
}

export async function readDocument({ extension, buffer }) {
  const warnings = [NOTE];
  if (extension === 'pdf' && !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a readable PDF.');
  const parts = extension === 'pdf' ? await readPdf(buffer, warnings) : await readDocx(buffer, warnings);
  const text = parts.map(part => part.text).join('\n\n');
  if (!text.trim()) throw new Error('No readable text found. Use a text-based PDF or DOCX; scans need OCR first.');
  if (text.length > 80000 || text.split(/\s+/u).length > 20000) throw new Error('Use a shorter document: at most 20,000 words and 80,000 characters. Nothing was truncated.');
  const segments = [];
  for (const part of parts) {
    for (let offset = 0; offset < part.text.length; offset += 2000) {
      segments.push({ id: `s${segments.length + 1}`, page: part.page, text: part.text.slice(offset, offset + 2000) });
    }
  }
  return { segments, warnings };
}

process.once('message', async ({ extension, buffer }) => {
  let reply;
  try {
    reply = await readDocument({ extension, buffer: Buffer.from(buffer) });
  } catch (error) {
    const safe = /^(Use a |No readable text|This file is not)/.test(error.message);
    reply = { error: safe ? error.message : 'Could not read this document. It may be damaged, password-protected, or unsupported. Try a readable PDF or DOCX.' };
  }
  process.send(reply, () => process.exit(0));
});
