import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

export type EpisodeRecord = {
  id: string;
  sourceType: string;
  sourceValue: string;
  parsedClaim: string;
  parsedTensions: string;
  parsedQuestions: string;
  moderatorId: string;
  panelistIds: string;
  guestPrompt: string;
  seriousness: number;
  humor: number;
  confrontation: number;
  durationMinutes: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type EventRecord = {
  id: string;
  episodeId: string;
  type: string;
  speakerId: string;
  text: string;
  tags: string;
  createdAt: string;
};

type EpisodeInsert = Omit<EpisodeRecord, "id" | "createdAt" | "updatedAt">;
type EventInsert = Omit<EventRecord, "id" | "createdAt">;

const projectRoot = process.env.INIT_CWD?.trim() || process.cwd();
const dbPath = path.resolve(projectRoot, "prisma", "dev.db");
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

let initialized = false;
function initSchema() {
  if (initialized) {
    return;
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_value TEXT NOT NULL,
      parsed_claim TEXT NOT NULL,
      parsed_tensions TEXT NOT NULL,
      parsed_questions TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      panelist_ids TEXT NOT NULL,
      guest_prompt TEXT NOT NULL DEFAULT '',
      seriousness REAL NOT NULL,
      humor REAL NOT NULL,
      confrontation REAL NOT NULL,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL,
      type TEXT NOT NULL,
      speaker_id TEXT NOT NULL,
      text TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_episode_created
      ON events(episode_id, created_at);
  `);
  initialized = true;
}

function nowIso() {
  return new Date().toISOString();
}

function mapEpisodeRow(row: Record<string, unknown>): EpisodeRecord {
  return {
    id: String(row.id),
    sourceType: String(row.source_type),
    sourceValue: String(row.source_value),
    parsedClaim: String(row.parsed_claim),
    parsedTensions: String(row.parsed_tensions),
    parsedQuestions: String(row.parsed_questions),
    moderatorId: String(row.moderator_id),
    panelistIds: String(row.panelist_ids),
    guestPrompt: String(row.guest_prompt),
    seriousness: Number(row.seriousness),
    humor: Number(row.humor),
    confrontation: Number(row.confrontation),
    durationMinutes: Number(row.duration_minutes),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapEventRow(row: Record<string, unknown>): EventRecord {
  return {
    id: String(row.id),
    episodeId: String(row.episode_id),
    type: String(row.type),
    speakerId: String(row.speaker_id),
    text: String(row.text),
    tags: String(row.tags),
    createdAt: String(row.created_at)
  };
}

export function createEpisode(input: EpisodeInsert): EpisodeRecord {
  initSchema();
  const id = randomUUID();
  const now = nowIso();
  sqlite
    .prepare(
      `INSERT INTO episodes (
        id, source_type, source_value, parsed_claim, parsed_tensions, parsed_questions,
        moderator_id, panelist_ids, guest_prompt, seriousness, humor, confrontation,
        duration_minutes, status, created_at, updated_at
      ) VALUES (
        @id, @sourceType, @sourceValue, @parsedClaim, @parsedTensions, @parsedQuestions,
        @moderatorId, @panelistIds, @guestPrompt, @seriousness, @humor, @confrontation,
        @durationMinutes, @status, @createdAt, @updatedAt
      )`
    )
    .run({
      id,
      ...input,
      createdAt: now,
      updatedAt: now
    });
  return {
    id,
    ...input,
    createdAt: now,
    updatedAt: now
  };
}

export function getEpisode(id: string): EpisodeRecord | null {
  initSchema();
  const row = sqlite
    .prepare(`SELECT * FROM episodes WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapEpisodeRow(row) : null;
}

export function getEventsByEpisode(episodeId: string): EventRecord[] {
  initSchema();
  const rows = sqlite
    .prepare(`SELECT * FROM events WHERE episode_id = ? ORDER BY created_at ASC`)
    .all(episodeId) as Array<Record<string, unknown>>;
  return rows.map(mapEventRow);
}

export function getEpisodeWithEvents(
  id: string
): (EpisodeRecord & { events: EventRecord[] }) | null {
  const episode = getEpisode(id);
  if (!episode) {
    return null;
  }
  const events = getEventsByEpisode(id);
  return { ...episode, events };
}

export function createEvent(input: EventInsert): EventRecord {
  initSchema();
  const id = randomUUID();
  const createdAt = nowIso();
  sqlite
    .prepare(
      `INSERT INTO events (
        id, episode_id, type, speaker_id, text, tags, created_at
      ) VALUES (
        @id, @episodeId, @type, @speakerId, @text, @tags, @createdAt
      )`
    )
    .run({ id, ...input, createdAt });
  return {
    id,
    ...input,
    createdAt
  };
}

export function updateEpisodeStatus(id: string, status: string) {
  initSchema();
  sqlite
    .prepare(`UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, nowIso(), id);
}

export function transaction<T>(fn: () => T): T {
  initSchema();
  return sqlite.transaction(fn)();
}
