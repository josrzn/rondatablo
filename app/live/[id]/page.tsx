"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  { id: "push_harder", label: "Nudge: Push Harder" },
  { id: "get_concrete", label: "Nudge: Get Concrete" },
  { id: "time_check", label: "Nudge: Time Check" },
  { id: "close_show", label: "Close: Parting Thoughts" }
] as const;

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const [episodeId, setEpisodeId] = useState("");
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [creatorQuestion, setCreatorQuestion] = useState("");
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
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!episodeId) {
      return;
    }
    loadEpisode().catch((err) => {
      setError(err instanceof Error ? err.message : "Unknown error");
    });
  }, [episodeId, loadEpisode]);

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
    }, 4200);

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
      setAutoRun(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const liveStatus = autoRun
    ? busy
      ? "Cast is speaking..."
      : "Auto mode: waiting for next intervention..."
    : busy
      ? "Generating next exchange..."
      : "Paused";

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
        <p>
          <strong>Status:</strong> {liveStatus}
        </p>
        <div className="row">
          <button
            onClick={() => setAutoRun((x) => !x)}
            disabled={busy}
          >
            {autoRun ? "Pause Discussion" : "Start Discussion"}
          </button>
          <button onClick={() => runStep("auto")} disabled={busy || autoRun}>
            Speak Next
          </button>
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => runStep(action.id)}
              disabled={busy || autoRun}
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
