# Rondatablo Pilot v0

Local-first pilot environment for creating and running live AI debate episodes.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + SQLite
- Local filesystem exports

## Run

1. Install dependencies:
   - `npm install`
2. Optional: set database URL (default is local SQLite):
   - `DATABASE_URL="file:./prisma/dev.db"`
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Create SQLite schema:
   - `npm run prisma:migrate`
5. Start app:
   - `npm run dev`

Open [http://localhost:3000](http://localhost:3000).

## Pilot Flow

1. `/intake`: URL/text input + source parsing.
2. `/cast`: pick moderator/panel, set controls, create episode.
3. `/live/[id]`: run live step controls and creator follow-ups.
4. `/export/[id]`: generate export pack in `exports/<episodeId>/`.

## Export Files

- `transcript.md`
- `show_notes.md`
- `audio_manifest.json`
- `episode_meta.json`
