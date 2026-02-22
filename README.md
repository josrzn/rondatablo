# Rondatablo Pilot v0

Local-first pilot environment for creating and running live AI debate episodes.

## Stack

- Next.js (App Router) + TypeScript
- SQLite (`prisma/dev.db`) via `better-sqlite3` runtime store
- Local filesystem exports
- Prisma kept for schema/migrations/client generation

## Run

1. Install dependencies:
   - `npm install`
2. Set environment variables:
   - `OPENAI_API_KEY=...` (required for real LLM analysis/debate generation)
   - `OPENAI_MODEL=gpt-5-mini` (optional default model override)
   - `OPENAI_DEBATE_MODEL=...` (optional panelist generation model)
   - `OPENAI_ARBITER_MODEL=...` (optional fast arbiter model)
3. Optional DB override:
   - `DATABASE_URL=...` (defaults to local SQLite `prisma/dev.db`)
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Create SQLite schema:
   - `npm run prisma:migrate`
6. Start app:
   - `npm run dev`

Open [http://localhost:3000](http://localhost:3000).

## Pilot Flow

1. `/new-show`: wizard flow for source intake, cast setup, review, and launch.
2. `/live/[id]`: run the live room with host interventions and autonomous cast turns.
3. `/export/[id]`: generate export pack in `exports/<episodeId>/`.

Legacy routes `/intake` and `/cast` now redirect to `/new-show`.

Live turns are LLM-only. If `OPENAI_API_KEY` is missing or turn generation fails, the step fails explicitly (no scripted utterance fallback).

## Current UX/Runtime Behavior

- Source type is auto-detected from pasted content in `/new-show` (URL vs text). There is no manual source-type selector.
- `Start Discussion`, `Speak Next`, and `End Discussion` generate LLM host suggestions into the Host prompt field; you can edit before submitting.
- Submitting host prompt injects a moderator line. For non-closing prompts, live auto mode resumes; for closing prompts, the app collects parting lines and stops auto mode.
- Debate feed progresses one event at a time (not batch insertion), so turns appear progressively.
- Speaker cards in live feed use per-speaker color accents for quick scanning.

## LLM Analysis Notes

- Source intake analysis is LLM-first with heuristic fallback.
- Tensions are normalized to 3 concise lines (with optional evidence quotes).
- If analysis falls back, the UI shows a warning with the concrete failure reason.
- `gpt-5*` models are supported without `temperature` (the client omits it automatically).
- Responses client retries when output is incomplete due to `max_output_tokens`.
- Host prompt suggestions are LLM-generated from full transcript context.
- Debate generation and arbitration currently use full transcript context (not a short history window).

## Persistence Note

- Episode/event runtime persistence uses
  `/Users/jrozen/Jos/Code/rondatablo/lib/store.ts` (direct `better-sqlite3` access).
- Prisma remains in the project (schema/config/deps/migrations), but the live
  read/write path currently uses the store layer.

## Export Files

- `transcript.md`
- `show_notes.md`
- `audio_manifest.json`
- `episode_meta.json`

## Known Limitations

- Debate quality is still variable: coherence and rhetorical sharpness improve with prompt/runtime tuning and model choice.
- Turn scheduling is heuristic, not a fully learned conversation policy; edge cases can still produce uneven speaker pacing.
- Live loop is polling-based and single-room local-first; there is no distributed queue/realtime streaming backend yet.
- Runtime persistence currently uses the local SQLite store layer (not Prisma client queries) for reliability in this pilot.
- TTS/voice production is not integrated yet; current output is text-first debate generation.
