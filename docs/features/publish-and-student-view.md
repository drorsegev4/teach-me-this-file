# Feature: per-session state, Publish, student page

Status, 4 November 2026: implemented in the working tree; automated coverage exists in publish.test.js. Full deployed/browser acceptance is pending. This is the original acceptance checklist, not a record that every criterion was manually verified.

Checklist built with the PRD lenses (story, journey, acceptance criteria with edge cases, entry points, states). No KPIs or analytics for now.

## User story
As a teacher, I want to publish the lesson I previewed and get a link, so that a student can open it and learn without seeing my goal, my plan or my file, and without disturbing my preview or anyone else's session.

## Entry points
| Who | How they get in | Lands on |
|---|---|---|
| Teacher | Opens the app | Goal box (stage 1) |
| Teacher | Lesson built | Create panel + student preview, with a Publish button |
| Teacher | Presses Publish | Link row: Copy link, Open as student |
| Student | Opens `/l/:id` | Landing card: topic facts, key field if needed, Start lesson |
| Student | Reloads mid-lesson | Chat restored where they stopped |
| Anyone | Opens `/l/:unknown` | "This lesson link is not available" with no teacher UI |
| Anyone | Opens `/` | Goal box, with no leftover lesson from other people |

## Happy path
1. Teacher builds a lesson; the welcome and lesson overview open automatically. They review the plan, optionally press Let's begin to preview the teaching, then press Publish.
2. A link `https://host/l/abc123` appears. Copy link copies it. Open as student opens it in the same tab, keeping the key in memory.
3. The student sees the welcome, document-wide overview, selected lesson scope and topic outline, with key settings when needed. They press Let's begin. The chat runs full screen.
4. The student's progress belongs to their own session. The teacher's preview and other students are unaffected.

## States to cover
| Screen | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Publish | Button shows "Publishing…" | Hidden until a lesson is built | "Could not publish. Build the lesson first." | Link row |
| Student landing | "Opening your lesson…" (also covers a cold start) | n/a | Link not available | Landing card |
| Student chat | Tutor thinking | n/a | Key rejected, reply failed (existing) | Lesson complete |

## Acceptance criteria
1. **Given** two browsers, **when** each runs a lesson, **then** their progress, messages and attempt counts never mix. Edge: both press Send at the same moment. Expected: both succeed, because the "tutor is busy" lock is per session, not global.
2. **Given** a built draft, **when** the teacher presses Publish twice, **then** the same link comes back. Edge: teacher starts a new lesson with another goal after publishing. Expected: the old link keeps serving the old plan; the panel shows no link until the new lesson is published.
3. **Given** a published link, **when** a student starts, **then** the lesson uses the plan as published. Edge: the teacher rebuilds a different plan after publishing. Expected: the student still gets the published one.
4. **Given** no draft, **when** Publish is called, **then** 409 "Build a lesson first." Edge: the draft build failed or was refused. Expected: same 409, no link.
5. **Given** an unknown or malformed lesson id, **when** it is opened, **then** 404 and the student page says the link is not available. Edge: the server restarted and lost published lessons. Expected: same message, and DECISIONS names this limit (in-memory on the free host).
6. **Given** a student with no key and a host with no key, **when** they press Start, **then** they are asked to paste a Gemini key first. Edge: the key is rejected. Expected: the existing 401 message, pointing at the key field on this page.
7. **Given** a student mid-lesson, **when** they reload, **then** the chat is restored. Edge: the session was evicted from memory. Expected: the landing card again, no error.
8. **Given** a student page, **when** it renders, **then** it shows no teacher prompt, internal understanding goals, source list or Create panel. The topic outline and overview are intentionally visible. Edge: step source quotes still arrive in the lesson state. Expected: not rendered; recorded as a known weakness.
9. **Given** an invalid session id header, **when** any chat or lesson API is called, **then** 400. Edge: no header at all. Expected: the shared default session, so existing tools and tests keep working.
10. **Given** many visitors, **when** memory fills, **then** the oldest sessions and drafts are dropped, not the server. Edge: the dropped student reloads. Expected: criterion 7.

## Out of scope here
Accounts, expiring links, unpublish, version history, persistence beyond memory, long-document handling.
