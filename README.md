# Rondatablo Pilot v0

Local-first pilot environment for creating and running live AI debate episodes.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + SQLite
- Local filesystem exports

## Run

1. Install dependencies:
   - `npm install`
2. Set environment variables:
   - `OPENAI_API_KEY=...` (required for real LLM analysis/debate generation)
   - `OPENAI_MODEL=gpt-5-mini` (optional override)
3. Optional: set database URL (default is local SQLite):
   - `DATABASE_URL="file:./prisma/dev.db"`
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

If `OPENAI_API_KEY` is missing or an LLM call fails, the app falls back to deterministic heuristics/templates.

## LLM Analysis Notes

- Source analysis is LLM-first with fallback.
- Tensions are normalized to 3 concise lines (with optional evidence quotes).
- If analysis falls back, the UI shows a warning with the concrete failure reason.
- `gpt-5*` models are supported without `temperature` (the client omits it automatically).

## Export Files

- `transcript.md`
- `show_notes.md`
- `audio_manifest.json`
- `episode_meta.json`
