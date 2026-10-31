import { fork } from 'node:child_process';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 30000;

// Reads a PDF or DOCX in a child process, not a worker thread: a native crash in the PDF library
// (seen on Node 24 in worker threads) then fails only this request and never the server.
export function extractDocument(file) {
  const extension = file?.originalname.split('.').at(-1).toLowerCase();
  if (!['pdf', 'docx'].includes(extension)) throw new Error('Attach one PDF or DOCX file.');
  if (!file.buffer.length || file.buffer.length > MAX_FILE_BYTES) throw new Error('Choose a nonempty file up to 10 MB.');
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./documentReader.js', import.meta.url), [], {
      serialization: 'advanced', execArgv: ['--max-old-space-size=128'], stdio: 'inherit',
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error); else resolve({ name: file.originalname, ...result });
    };
    const timer = setTimeout(() => finish(new Error('Reading this document took too long. Try a smaller file.')), TIMEOUT_MS);
    child.once('message', reply => finish(reply.error ? new Error(reply.error) : null, reply));
    child.once('error', () => finish(new Error('Could not process this document. Try a smaller, readable file.')));
    child.once('exit', () => finish(new Error('Document processing stopped. Try a smaller file.')));
    child.send({ extension, buffer: file.buffer });
  });
}
