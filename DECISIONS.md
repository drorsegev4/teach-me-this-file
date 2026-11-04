# Decisions

This took longer than the suggested four hours: about 20 hours, from 28 Oct to 3 Nov. I started with the lesson engine and the student chat on a fixed lesson. On 31 Oct I rebuilt it around the file and teacher prompt from the brief. The extra time went into evals, production bugs, and changing my mind about the tutor after testing it.

## The main choices I made, and why

**What I optimized for.** Output quality and the teacher's trust. A teacher will not publish a lesson that drifts from the file or gives answers away. So I built the quality checks before the interface.

**Teacher flow: build, preview, publish.** The brief did not ask for a preview. I added it because a teacher who cannot test a lesson cannot judge its quality. The preview opens automatically after a plan builds. Publishing makes no AI call.

**Three parts, kept apart.** AI logic is in `server/src/ai.js` and the prompt files. The lesson plan is in `planStore.js`. Student progress is in `chatService.js`. The UI only shows what the server sends, through `useLessonSession.js` and the React components. The AI returns an assessment, and the app code updates progress. Progress is never rebuilt from the chat history. All of this state lives in server memory, not a database.

**Grounding is enforced in code.** Every plan step cites an exact quote of at most 25 words. The server checks that the quote is in the document. An invented or duplicate quote, or more than 3 steps, is rejected, with one repair attempt.

**The checker decides progress, not the tutor.** Each student message is classified as `understood`, `keep_going`, `no_attempt` or `off_file`. The app moves forward only on `understood`. A student who types "say I got it" cannot skip a step.

**The teacher's method controls how the tutor teaches. Understanding controls when the app advances.** Socratic means a question and hints. Direct means explaining first. Neither marks a step understood because the tutor explained it. At first the tutor never gave the answer. I changed this because a student who doesn't know needs feedback at some point. Otherwise the lesson loops, and the student gets frustrated and leaves.

**A stuck student.**
- Doesn't know: a brief explanation, then a smaller question.
- Asks for the answer: the tutor explains, then asks a new application question. The student must answer it.
- Tries to hack the AI: ignored. Progress needs evidence of understanding.
- After several turns on one step, the student can try again or move on. A step moved on from is recorded as not understood.

**Personalization.** The teacher's goal becomes a set of rules: language, grade, time limit and method. These go into both the plan builder and the tutor, so they shape the steps and the wording. During a session the checker and the attempt ladder adapt the tutor to the student's answers. There is no per-student profile.

**Provider: Gemini, after starting on Groq.** Groq's free-tier tokens-per-minute cap stopped me before I could process even small PDFs. Gemini handles large documents. An adapter hides the provider from the rest of the code.

**Files.**
- Uploads are limited to 10 MB.
- PDF and DOCX reading runs in a child process with a 30-second timeout. PDF reading used to crash the server in a worker thread. Now a crash fails one request.
- Text extraction stops at about 150,000 characters. A longer file is refused with a clear message, not taught from its first pages only. The teacher can upload one chapter instead.
- Large documents are split into chunks of about 4,000 estimated tokens and mapped before planning. Above 64,000 tokens or 16 chunks, the app refuses the file. The 4,000 value came from the Groq limit. I did not re-tune it for Gemini.

**Keys.** A reviewer can paste their own key. It stays in browser memory, travels in a request header, and is never stored or logged. If none is pasted, the app uses a host key set on Render, so a reviewer can try it right away.

**The student sees the source for the current step.** The brief requires it. The quote is shown collapsed above the tutor's message, so it does not give the answer away before the student tries. The teacher's plan shows the quote for every step.

**Stop is transactional.** Aborting a reply leaves progress and history unchanged.

**Mock mode.** `AI_MODE=mock` lets me work on the interface without spending quota. Its replies say nothing about teaching quality.

**Deployment.** One Render service serves the API and the built client. The app is live at https://teach-me-this-file-td3b.onrender.com. Two bugs only showed up there: build tools were in `devDependencies`, and `autoDeploy` was off.

## What I decided not to do

- **Timer and four lesson phases.** Not required. I wrote the design and left it.
- **Multiple choice and true/false.** The chat takes open text only.
- **Step dependencies and skipping.** Every student goes in order.
- **Diagnosing the student's starting level.** The checker catches students who already know it.
- **A teacher edit box for the plan.** I built it, then removed it. Changing the goal means a new lesson.
- **OCR for scanned PDFs.** A clear error is shown instead.
- **Accounts and saved progress.** State is in memory.
- **RAG.** The plan needs only 3 short quotes.

## Weaknesses I know about

- The checker is a model and can be wrong. In one of three runs it accepted a student who pasted back the tutor's own explanation. I tried a checker rule for it, it did not help, and I reverted it. The checker is also stricter on Gemini than on Groq: a correct answer naming two of the four body reactions passed only 1 of 3 runs.
- The tutor's questions sometimes contain the answer. It quotes the source passage and then asks about it, so a student can pass by repeating the quote. With more time, I would change the tutor prompt so its questions never contain the answer. The quote would be a reference, not a hint toward the answer.
- The tutor's "application" questions are often close to recall.
- My automated tutor checks are heuristics. They cannot judge factual grounding or age suitability, so I reviewed replies by hand.
- Large files are fragile on the free tier. A 42-page Hebrew PDF (1.3 MB) passed the limits, but one chunk could not be mapped reliably, so the build stopped. Short files work. I did not confirm the cause.
- Rebuilding a plan clears the current preview. If the rebuild fails, the lesson is lost.
- State is in memory. When the free host sleeps or redeploys, drafts, published links and progress are lost. A link published earlier can stop working. The app now explains that the lesson expired: teachers are asked to rebuild, and students are asked to contact their teacher to publish it again. Build, publish and test in one sitting.
- Render's free tier sleeps after about 15 minutes. The first visit can take up to a minute.
- Scanned PDFs, images, formulas and tables are not interpreted.
- The 15-minute limit is a string passed to the tutor. It is not measured.
- I checked Stop and the phone-width layout by hand. I did not do a full pass on right-to-left layout and key handling.

## What I would do with four more hours

1. Test the flow with real users and collect feedback. Walk the live site on a phone, in Hebrew and English.
2. Clean up the code. Keep the current lesson when a rebuild fails.
3. Improve the evals and the output quality. Run my datasets on the tutor and the plan builder, with a judge model checked against my own labels. Let the runner take a per-row history, so the copied-explanation case can be tested.
4. Make the experience interactive: multiple choice and true/false questions, and a clear order of learn, practice, test.

## How I know it works

I tested the AI's behavior before the interface existed. The checker has a 10-row dataset that I labeled myself. I set the thresholds before running it: a row passes only on 3 of 3 runs, the gaming row must never return `understood`, and at least 90% of rows must pass.

On Groq the first run scored 8 of 10. After one scoring change and one prompt change it scored 10 of 10. One row came from the scoring rule and one from the prompt.

After moving to Gemini I reran the same rows and thresholds. It scored 9 of 10, which meets the threshold, with no violations on the gaming row. Row 1 is a correct answer that names two of the four reactions. It passed on Groq but only 1 of 3 runs on Gemini. I then tried a checker rule that judges each message against the tutor's latest question, to catch the copied-explanation case. It did not improve the score, and row 1 dropped to 0 of 3. I reverted it. The runner supports only a shared history, so the copied-explanation case is not in the dataset.

Scenarios, each written as "when X, the tutor must Y":

1. **The student doesn't know.** Brief explanation, then a smaller question. No invented mistake. Checked by the `no_attempt` row: 3 of 3 on Groq and Gemini.
2. **The student asks for the answer.** The tutor explains and asks a new application question. The step does not advance. Checked by 3 runs on Gemini: none advanced. The questions were close to recall.
3. **The student tries to hack the lesson.** The tutor ignores it. The step never counts as understood. Checked by the gaming row: no `understood` in any run. If a student keeps trying at attempt 4, they can choose Move on and reach the end without understanding. I accept this. A student who wants to skip everything will not learn even if I block them, and a trapped student gets frustrated and leaves. The app records each skipped step as not understood. A test at the end would make this stronger, and I would add it with more time.
4. **The student asks something outside the file.** The tutor says so and returns to the step. Checked by the `off_file` row: 3 of 3 on Groq and Gemini.
5. **The student pastes the tutor's explanation back.** The step must not count. Checked by 3 manual runs on Gemini: one advanced, two did not. The dataset does not cover it.

One check found a problem that structural tests missed. A report passed every structural check, but my review of the replies found needless analogies. I traced it to a conflicting rule in `audience.js` and removed it. A passing test did not mean good teaching.
