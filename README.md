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
2. `/live/[id]`: run live step controls and creator follow-ups.
3. `/export/[id]`: generate export pack in `exports/<episodeId>/`.

Legacy routes `/intake` and `/cast` now redirect to `/new-show`.

Live turns are LLM-only. If `OPENAI_API_KEY` is missing or turn generation fails, the step fails explicitly (no scripted utterance fallback).

## LLM Analysis Notes

- Source intake analysis is LLM-first with heuristic fallback.
- Tensions are normalized to 3 concise lines (with optional evidence quotes).
- If analysis falls back, the UI shows a warning with the concrete failure reason.
- `gpt-5*` models are supported without `temperature` (the client omits it automatically).
- Responses client retries when output is incomplete due to `max_output_tokens`.

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
