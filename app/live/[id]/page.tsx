"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventRecord = {
  id: string;
  type: string;
  speakerId: string;
  text: string;
  tags: string;
  createdAt: string;
};

type Episode = {
  id: string;
  sourceValue: string;
  parsedClaim: string;
  parsedTensions: string;
  parsedQuestions: string;
  status: string;
  events: EventRecord[];
};

const ACTIONS = [
  { id: "push_harder", label: "Push Harder" },
  { id: "get_concrete", label: "Get Concrete" },
  { id: "time_check", label: "Time Check" }
] as const;

const SPEAKER_THEME: Record<string, string> = {
  editor_v1: "speaker-moderator",
  editor_warm_v1: "speaker-moderator",
  accel_v1: "speaker-accel",
  inst_realist_v1: "speaker-realist",
  labor_v1: "speaker-labor",
  guest_v1: "speaker-guest"
};

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState("");
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [creatorQuestion, setCreatorQuestion] = useState("");
  const [promptMode, setPromptMode] = useState<
    "followup" | "opening" | "next" | "closing"
  >("followup");
  const busyRef = useRef(false);

  useEffect(() => {
    if (typeof params.id === "string") {
      setEpisodeId(params.id);
    }
  }, [params]);

  const loadEpisode = useCallback(async () => {
    if (!episodeId) {
      return;
    }
    const res = await fetch(`/api/episodes/${episodeId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load episode");
    }
    setEpisode(data as Episode);
  }, [episodeId]);

  useEffect(() => {
    if (!episodeId) {
      return;
    }
    loadEpisode().catch((err) => {
      setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [episodeId, loadEpisode]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!autoRun || !episodeId) {
      return;
    }
    let active = true;
    const tick = async () => {
      if (!active || busyRef.current) {
        return;
      }
      await runStep("auto");
    };
    tick().catch(() => undefined);
    const interval = setInterval(() => {
      tick().catch(() => undefined);
    }, 3600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [autoRun, episodeId]);

  const unresolvedDisputes = useMemo(() => {
    if (!episode) {
      return [];
    }
    return episode.parsedTensions.split("|").map((x) => x.trim());
  }, [episode]);

  async function requestStep(action: string, question?: string) {
    const res = await fetch(`/api/episodes/${episodeId}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, creatorQuestion: question })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to run step");
    }
    return data;
  }

  async function fetchHostSuggestion(mode: "opening" | "next" | "closing") {
    const res = await fetch(`/api/episodes/${episodeId}/host-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to generate host suggestion");
    }
    return String(data.text ?? "");
  }

  function speakerClass(speakerId: string): string {
    return SPEAKER_THEME[speakerId] ?? "speaker-default";
  }

  async function runStep(action: string, question?: string) {
    if (!episodeId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestStep(action, question);
      await loadEpisode();
    } catch (err) {
      setAutoRun(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const liveStatus = autoRun
    ? busy
      ? "Debate is live..."
      : "Debate is live (auto)"
    : busy
      ? "Generating next exchange..."
      : "Paused";

  async function suggestHostPrompt(mode: "opening" | "next" | "closing") {
    if (!episodeId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const text = await fetchHostSuggestion(mode);
      setCreatorQuestion(text);
      setPromptMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function sendFollowUp() {
    if (!creatorQuestion.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const action = promptMode === "closing" ? "close_show" : "creator_followup";
      await requestStep(action, creatorQuestion);
      if (promptMode === "closing") {
        // After the host close prompt, run a couple of close turns to collect parting lines.
        await requestStep("close_show");
        await requestStep("close_show");
        setAutoRun(false);
      } else {
        setAutoRun(true);
      }
      setCreatorQuestion("");
      setPromptMode("followup");
      await loadEpisode();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h1>Live Studio</h1>
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.back()}
          >
            Back
          </button>
          <Link href="/" className="btn btn-secondary">
            Home
          </Link>
          <Link href={`/export/${episodeId}`} className="btn btn-secondary">
            Export
          </Link>
        </div>
        <p className="mono">{episodeId}</p>
        {episode ? (
          <>
            <p>
              <strong>Source:</strong> {episode.sourceValue}
            </p>
            <p>
              <strong>Claim:</strong> {episode.parsedClaim}
            </p>
          </>
        ) : (
          <p>Loading...</p>
        )}
      </div>
      <div className="card stack">
        <h2>Live Controls</h2>
        <p>
          <strong>Status:</strong> {liveStatus}
        </p>
        <div className="control-group stack">
          <div className="action-grid">
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => suggestHostPrompt("opening")}
              disabled={busy}
            >
              Start Discussion
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => suggestHostPrompt("next")}
              disabled={busy}
            >
              Speak Next
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => suggestHostPrompt("closing")}
              disabled={busy}
            >
              End Discussion
            </button>
          </div>
          <div className="action-grid">
            {ACTIONS.map((action) => (
              <button
                type="button"
                className="btn btn-chip btn-compact"
                key={action.id}
                onClick={() => runStep(action.id)}
                disabled={busy}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
        <label>
          Host prompt
          <textarea
            className="host-prompt-input"
            rows={4}
            value={creatorQuestion}
            onChange={(e) => {
              setCreatorQuestion(e.target.value);
              if (!e.target.value.trim()) {
                setPromptMode("followup");
              }
            }}
            placeholder="Write the host intervention, then submit it to the cast..."
          />
        </label>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={sendFollowUp}
            disabled={busy || !creatorQuestion.trim()}
          >
            {promptMode === "opening"
              ? "Submit Opening"
              : promptMode === "next"
                ? "Submit Next Prompt"
              : promptMode === "closing"
                ? "Submit Closing"
                : "Inject Follow-Up"}
          </button>
        </div>
        {error ? <p className="monitor-warning">{error}</p> : null}
      </div>
      <div className="card stack">
        <h2>Unresolved Disputes</h2>
        {unresolvedDisputes.length > 0 ? (
          <ul>
            {unresolvedDisputes.map((item, idx) => (
              <li key={`${idx}-${item.slice(0, 20)}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>-</p>
        )}
      </div>
      <div className="card stack">
        <h2>Debate Feed</h2>
        {episode?.events.length ? (
          episode.events.map((event) => (
            <div className={`event ${speakerClass(event.speakerId)}`} key={event.id}>
              <p className="event-meta">
                <strong>{event.speakerId}</strong> <span>({event.type})</span>
              </p>
              <p>{event.text}</p>
            </div>
          ))
        ) : (
          <p>No events yet. Run a step to begin.</p>
        )}
      </div>
    </div>
  );
}
