"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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
  { id: "normal", label: "Normal Step" },
  { id: "push_harder", label: "Push Harder" },
  { id: "get_concrete", label: "Get Concrete" },
  { id: "time_check", label: "Time Check" }
] as const;

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const [episodeId, setEpisodeId] = useState("");
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatorQuestion, setCreatorQuestion] = useState("");

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

  async function runStep(action: string) {
    if (!episodeId) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/episodes/${episodeId}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
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

  async function sendFollowUp() {
    if (!creatorQuestion.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/episodes/${episodeId}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creator_followup",
          creatorQuestion
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send follow-up");
      }
      setCreatorQuestion("");
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
        <div className="row">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => runStep(action.id)}
              disabled={busy}
            >
              {action.label}
            </button>
          ))}
          <Link href={`/export/${episodeId}`}>Go to Export</Link>
        </div>
        <label>
          Creator follow-up
          <textarea
            rows={2}
            value={creatorQuestion}
            onChange={(e) => setCreatorQuestion(e.target.value)}
            placeholder="Ask a direct follow-up question..."
          />
        </label>
        <button onClick={sendFollowUp} disabled={busy || !creatorQuestion.trim()}>
          Inject Follow-Up
        </button>
        {error ? <p>{error}</p> : null}
      </div>
      <div className="card stack">
        <h2>Unresolved Disputes</h2>
        <p>{unresolvedDisputes.length > 0 ? unresolvedDisputes.join(" | ") : "-"}</p>
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
