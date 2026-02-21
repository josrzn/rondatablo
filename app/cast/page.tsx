"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Draft = {
  sourceType: "url" | "text";
  value: string;
  parsed: {
    claim: string;
    tensions: string[];
    openQuestions: string[];
  };
};

const PANEL_OPTIONS = ["accel_v1", "inst_realist_v1", "labor_v1", "guest_v1"];

export default function CastPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [moderatorId, setModeratorId] = useState("editor_v1");
  const [panelistIds, setPanelistIds] = useState<string[]>([
    "accel_v1",
    "inst_realist_v1",
    "labor_v1"
  ]);
  const [guestPrompt, setGuestPrompt] = useState("");
  const [seriousness, setSeriousness] = useState(0.85);
  const [humor, setHumor] = useState(0.35);
  const [confrontation, setConfrontation] = useState(0.7);
  const [durationMinutes, setDurationMinutes] = useState(14);

  useEffect(() => {
    const raw = localStorage.getItem("rt_source_draft");
    if (!raw) {
      return;
    }
    try {
      setDraft(JSON.parse(raw) as Draft);
    } catch {
      setError("Failed to parse source draft from local storage.");
    }
  }, []);

  const canStart = useMemo(() => {
    return Boolean(draft && panelistIds.length >= 2 && panelistIds.length <= 4);
  }, [draft, panelistIds.length]);

  function togglePanel(id: string) {
    setPanelistIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, id];
    });
  }

  async function startEpisode() {
    if (!draft) {
      setError("No source draft found. Use intake first.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            type: draft.sourceType,
            value: draft.value,
            parsedClaim: draft.parsed.claim,
            parsedTensions: draft.parsed.tensions,
            parsedQuestions: draft.parsed.openQuestions
          },
          cast: {
            moderatorId,
            panelistIds,
            guestPrompt
          },
          controls: {
            seriousness,
            humor,
            confrontation,
            durationMinutes
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create episode");
      }
      router.push(`/live/${data.episodeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h1>Cast Builder</h1>
        <p>Pick the exact moderator and panel for this episode.</p>
      </div>
      <div className="card stack">
        <label>
          Moderator ID
          <input
            value={moderatorId}
            onChange={(e) => setModeratorId(e.target.value)}
          />
        </label>
        <div className="stack">
          <strong>Panelists (2-4)</strong>
          <div className="row">
            {PANEL_OPTIONS.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={panelistIds.includes(id)}
                  onChange={() => togglePanel(id)}
                />{" "}
                {id}
              </label>
            ))}
          </div>
        </div>
        <label>
          Optional guest prompt
          <textarea
            rows={2}
            value={guestPrompt}
            onChange={(e) => setGuestPrompt(e.target.value)}
          />
        </label>
        <div className="row">
          <label>
            Seriousness (0-1)
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={seriousness}
              onChange={(e) => setSeriousness(Number(e.target.value))}
            />
          </label>
          <label>
            Humor (0-1)
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={humor}
              onChange={(e) => setHumor(Number(e.target.value))}
            />
          </label>
          <label>
            Confrontation (0-1)
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confrontation}
              onChange={(e) => setConfrontation(Number(e.target.value))}
            />
          </label>
          <label>
            Duration (min)
            <input
              type="number"
              min={5}
              max={60}
              step={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="row">
          <button disabled={!canStart || busy} onClick={startEpisode}>
            {busy ? "Creating..." : "Start Live Debate"}
          </button>
          <Link href="/intake">Back to Intake</Link>
        </div>
        {error ? <p>{error}</p> : null}
      </div>
      <div className="card stack">
        <h2>Current Source Draft</h2>
        {draft ? (
          <>
            <p>
              <strong>Type:</strong> {draft.sourceType}
            </p>
            <p>
              <strong>Value:</strong> {draft.value}
            </p>
            <p>
              <strong>Claim:</strong> {draft.parsed.claim}
            </p>
          </>
        ) : (
          <p>No source draft found. Complete intake first.</p>
        )}
      </div>
    </div>
  );
}
