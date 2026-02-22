"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState("");
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatorQuestion, setCreatorQuestion] = useState("");
  const [promptMode, setPromptMode] = useState<
    "followup" | "opening" | "next" | "closing"
  >("followup");

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

  const unresolvedDisputes = useMemo(() => {
    if (!episode) {
      return [];
    }
    return episode.parsedTensions.split("|").map((x) => x.trim());
  }, [episode]);

  async function suggestHostPrompt(mode: "opening" | "next" | "closing") {
    if (!episodeId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/episodes/${episodeId}/host-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to generate host suggestion");
      }
      setPromptMode(mode);
      setCreatorQuestion(String(data.text ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function runStep(action: string, question?: string) {
    if (!episodeId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/episodes/${episodeId}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, creatorQuestion: question })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to run step");
      }
      await loadEpisode();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const liveStatus = busy ? "Generating next exchange..." : "Ready";

  async function sendFollowUp() {
    if (!creatorQuestion.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const action = promptMode === "closing" ? "close_show" : "creator_followup";
      const res = await fetch(`/api/episodes/${episodeId}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          creatorQuestion
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send follow-up");
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
            <div className="event" key={event.id}>
              <p>
                <strong>{event.speakerId}</strong> ({event.type})
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
