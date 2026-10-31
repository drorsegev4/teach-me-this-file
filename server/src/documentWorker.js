import { parentPort, workerData } from 'node:worker_threads';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

try {
  const buffer = Buffer.from(workerData.buffer);
  let parts;
  const warnings = ['Text extraction only: images, diagrams, formulas, and table layout are not interpreted. Review the extracted text before relying on it.'];
  if (workerData.extension === 'pdf') {
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a readable PDF.');
    const parser = new PDFParse({ data: buffer, verbosity: 0 });
    try {
      const info = await parser.getInfo();
      if (info.total > 60) throw new Error('Use a PDF with at most 60 pages for this first version.');
      const result = await parser.getText();
      parts = result.pages.map(page => ({ page: page.num, text: page.text.trim() }));
      const emptyPages = parts.filter(part => !part.text).map(part => part.page);
      if (emptyPages.length) warnings.push(`No readable text on PDF pages ${emptyPages.join(', ')}. Scanned content is not read.`);
    } finally { await parser.destroy(); }
  } else {
    if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('This file is not a readable DOCX.');
    const result = await mammoth.extractRawText({ buffer });
    parts = [{ page: null, text: result.value.trim() }];
    if (result.messages.length) warnings.push('The Word reader reported unsupported document elements. Check the extracted text.');
  }
  const text = parts.map(part => part.text).join('\n\n');
  if (!text.trim()) throw new Error('No readable text found. Use a text-based PDF or DOCX; scans need OCR first.');
  if (text.length > 80000 || text.split(/\s+/u).length > 20000) throw new Error('Use a shorter document: at most 20,000 words and 80,000 characters. Nothing was truncated.');
  const segments = [];
  for (const part of parts) {
    for (let offset = 0; offset < part.text.length; offset += 2000) {
      segments.push({ id: `s${segments.length + 1}`, page: part.page, text: part.text.slice(offset, offset + 2000) });
    }
  }
  parentPort.postMessage({ segments, warnings });
} catch (error) {
  const safe = /^(Use a |No readable text|This file is not)/.test(error.message);
  parentPort.postMessage({ error: safe ? error.message : 'Could not read this document. It may be damaged, password-protected, or unsupported. Try a readable PDF or DOCX.' });
}
