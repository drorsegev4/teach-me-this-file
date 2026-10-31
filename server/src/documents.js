import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 30000;
const READER = fileURLToPath(new URL('./documentReader.js', import.meta.url));

// Reads a PDF or DOCX in a child process, not a worker thread: a native crash in the PDF library
// (seen on Node 24 in worker threads) then fails only this request and never the server.
// The file goes in on stdin and the JSON result comes out on stdout, so nothing depends on IPC.
export function extractDocument(file) {
  const extension = file?.originalname.split('.').at(-1).toLowerCase();
  if (!['pdf', 'docx'].includes(extension)) throw new Error('Attach one PDF or DOCX file.');
  if (!file.buffer.length || file.buffer.length > MAX_FILE_BYTES) throw new Error('Choose a nonempty file up to 10 MB.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=128', READER, extension], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    let output = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error); else resolve({ name: file.originalname, ...result });
    };
    const timer = setTimeout(() => finish(new Error('Reading this document took too long. Try a smaller file.')), TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.once('error', () => finish(new Error('Could not process this document. Try a smaller, readable file.')));
    child.once('close', () => {
      let reply;
      try {
        reply = JSON.parse(output);
      } catch {
        return finish(new Error('Document processing stopped. Try a smaller file.'));
      }
      if (reply.error) return finish(new Error(reply.error));
      if (!Array.isArray(reply.segments)) return finish(new Error('Could not process this document. Try a smaller, readable file.'));
      return finish(null, reply);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(file.buffer);
  });
}
