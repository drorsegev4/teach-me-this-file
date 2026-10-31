import { Worker } from 'node:worker_threads';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function extractDocument(file) {
  const extension = file?.originalname.split('.').at(-1).toLowerCase();
  if (!['pdf', 'docx'].includes(extension)) throw new Error('Attach one PDF or DOCX file.');
  if (!file.buffer.length || file.buffer.length > MAX_FILE_BYTES) throw new Error('Choose a nonempty file up to 10 MB.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./documentWorker.js', import.meta.url), {
      workerData: { extension, buffer: file.buffer }, resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error); else resolve({ name: file.originalname, ...result });
    };
    const timer = setTimeout(() => finish(new Error('Reading this document took too long. Try a smaller file.')), 30000);
    worker.once('message', result => finish(result.error ? new Error(result.error) : null, result));
    worker.once('error', () => finish(new Error('Could not process this document. Try a smaller, readable file.')));
    worker.once('exit', () => { if (!settled) finish(new Error('Document processing stopped. Try a smaller file.')); });
  });
}
