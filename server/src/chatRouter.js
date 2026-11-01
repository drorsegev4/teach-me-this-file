import { Router } from 'express';
import { z } from 'zod';
import { ChatError } from './chatService.js';
import { ProviderError } from './ai.js';
import { PlanError } from './lessonPlan.js';
import { sessionKey } from './session.js';

const turnBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), lessonId: z.string().regex(/^[\w-]{4,32}$/).optional() }).strict(),
  z.object({ type: z.literal('message'), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('move_on') }).strict(),
]);

// Replies stream as server-sent events: "chunk" while the tutor writes, then "done" with the
// full state, or "error". Closing the connection (Stop) aborts the reply and commits nothing.
export function createChatRouter({ chat, aiFor }) {
  const router = Router();

  router.get('/', (req, res) => {
    const state = chat.view(sessionKey(req));
    if (!state) return res.status(404).json({ error: 'No lesson has started yet.' });
    res.json(state);
  });

  router.post('/turn', async (req, res) => {
    const parsed = turnBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid chat request.' });

    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const controller = new AbortController();
    let finished = false;
    res.on('close', () => { if (!finished) controller.abort(); });

    try {
      const state = await chat.turn({
        ...parsed.data,
        key: sessionKey(req),
        ai: aiFor(req),
        onChunk: text => send('chunk', { text }),
        signal: controller.signal,
      });
      finished = true;
      send('done', state);
    } catch (error) {
      finished = true;
      if (error instanceof ChatError) send('error', { message: error.message, status: error.status });
      else if (error instanceof PlanError) send('error', { message: 'The lesson plan did not pass the source check. Try again.', status: 502 });
      else if (error instanceof ProviderError) send('error', { message: error.message, status: 502 });
      else if (controller.signal.aborted) return;
      else {
        console.error('[chat] unexpected failure:', error.name);
        send('error', { message: 'The tutor could not reply. Your progress is unchanged; try again.', status: 500 });
      }
    } finally {
      res.end();
    }
  });
  return router;
}
