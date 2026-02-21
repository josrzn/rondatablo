"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ParseSourceResponse, SourceType } from "@/lib/types";

const PERSONAS: Record<
  string,
  { label: string; lens: string; vibe: string; type: "panelist" | "moderator" }
> = {
  editor_v1: {
    label: "The Editor",
    lens: "Forces specificity and calls rhetorical evasions.",
    vibe: "Sharp, dry, tempo-driven.",
    type: "moderator"
  },
  editor_warm_v1: {
    label: "The Diplomatic Editor",
    lens: "Maintains tension while keeping debate coherent.",
    vibe: "Calm, incisive, less combative.",
    type: "moderator"
  },
  accel_v1: {
    label: "Accelerationist",
    lens: "Capability growth, scale, compounding deployment advantages.",
    vibe: "Fast, bullish, occasionally dismissive.",
    type: "panelist"
  },
  inst_realist_v1: {
    label: "Institutional Realist",
    lens: "Governance limits, coordination debt, system fragility.",
    vibe: "Measured, skeptical, surgical.",
    type: "panelist"
  },
  labor_v1: {
    label: "Labor Analyst",
    lens: "Distributional effects, worker leverage, social stability.",
    vibe: "Concrete, moral pressure, practical examples.",
    type: "panelist"
  },
  guest_v1: {
    label: "Guest Seat",
    lens: "Custom perspective from your guest prompt.",
    vibe: "Variable by episode.",
    type: "panelist"
  }
};

const CONTROL_PRESETS = [
  { id: "policy_heat", label: "Policy Heat", seriousness: 0.9, humor: 0.2, confrontation: 0.75 },
  { id: "operator_war_room", label: "Operator War Room", seriousness: 0.85, humor: 0.25, confrontation: 0.8 },
  { id: "sharp_and_funny", label: "Sharp + Funny", seriousness: 0.75, humor: 0.55, confrontation: 0.65 }
];

const EMPTY_PARSE: ParseSourceResponse = { claim: "", tensions: [], openQuestions: [] };

export default function NewShowPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<SourceType>("url");
  const [value, setValue] = useState("");
  const [parsed, setParsed] = useState<ParseSourceResponse>(EMPTY_PARSE);
  const [moderatorId, setModeratorId] = useState("editor_v1");
  const [panelistIds, setPanelistIds] = useState<string[]>(["accel_v1", "inst_realist_v1", "labor_v1"]);
  const [guestPrompt, setGuestPrompt] = useState("");
  const [seriousness, setSeriousness] = useState(0.85);
  const [humor, setHumor] = useState(0.35);
  const [confrontation, setConfrontation] = useState(0.7);
  const [durationMinutes, setDurationMinutes] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sourceReady = useMemo(() => Boolean(value.trim() && parsed.claim), [value, parsed.claim]);
  const castReady = panelistIds.length >= 2 && panelistIds.length <= 4;

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

  async function analyzeSource() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sources/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, value })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Source analysis failed");
      }
      setParsed(data as ParseSourceResponse);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function launchShow() {
    if (!sourceReady || !castReady) {
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
            type: sourceType,
            value,
            parsedClaim: parsed.claim,
            parsedTensions: parsed.tensions,
            parsedQuestions: parsed.openQuestions
          },
          cast: { moderatorId, panelistIds, guestPrompt },
          controls: { seriousness, humor, confrontation, durationMinutes }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create show");
      }
      router.push(`/live/${data.episodeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack wizard-shell">
      <div className="card stack wizard-hero">
        <h1>New Show Wizard</h1>
        <p>From source to live room in three steps.</p>
        <div className="stepper">
          <div className={`step-pill ${step >= 1 ? "active" : ""}`}>1. Source</div>
          <div className={`step-pill ${step >= 2 ? "active" : ""}`}>2. Cast</div>
          <div className={`step-pill ${step >= 3 ? "active" : ""}`}>3. Review</div>
        </div>
      </div>

      {step === 1 ? (
        <div className="card stack">
          <h2>Step 1: Source Intake</h2>
          <label>
            Source type
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
              <option value="url">URL</option>
              <option value="text">Raw text</option>
            </select>
          </label>
          <label>
            Source
            <textarea
              rows={8}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste a URL or text excerpt"
            />
          </label>
          <div className="row">
            <button className="btn btn-primary" onClick={analyzeSource} disabled={busy || !value.trim()}>
              {busy ? "Analyzing..." : "Analyze and Continue"}
            </button>
            <Link className="btn btn-secondary" href="/">
              Cancel Setup
            </Link>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card stack">
          <h2>Step 2: Cast and Tone</h2>
          <p className="subtle">Claim: {parsed.claim}</p>
          <label>
            Moderator
            <select value={moderatorId} onChange={(e) => setModeratorId(e.target.value)}>
              {Object.entries(PERSONAS)
                .filter(([, meta]) => meta.type === "moderator")
                .map(([id, meta]) => (
                  <option key={id} value={id}>
                    {meta.label}
                  </option>
                ))}
            </select>
          </label>
          <div className="stack">
            <strong>Panel (2-4)</strong>
            <div className="persona-grid">
              {Object.entries(PERSONAS)
                .filter(([, meta]) => meta.type === "panelist")
                .map(([id, meta]) => {
                  const selected = panelistIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`persona-card ${selected ? "selected" : ""}`}
                      onClick={() => togglePanel(id)}
                    >
                      <span className="persona-title">{meta.label}</span>
                      <span>{meta.lens}</span>
                      <span>{meta.vibe}</span>
                    </button>
                  );
                })}
            </div>
          </div>
          <label>
            Guest prompt (optional)
            <textarea rows={2} value={guestPrompt} onChange={(e) => setGuestPrompt(e.target.value)} />
          </label>
          <div className="row">
            {CONTROL_PRESETS.map((preset) => (
              <button
                className="btn btn-chip"
                type="button"
                key={preset.id}
                onClick={() => {
                  setSeriousness(preset.seriousness);
                  setHumor(preset.humor);
                  setConfrontation(preset.confrontation);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="slider-grid">
            <label>
              Seriousness: {Math.round(seriousness * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={seriousness} onChange={(e) => setSeriousness(Number(e.target.value))} />
            </label>
            <label>
              Humor: {Math.round(humor * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={humor} onChange={(e) => setHumor(Number(e.target.value))} />
            </label>
            <label>
              Confrontation: {Math.round(confrontation * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={confrontation} onChange={(e) => setConfrontation(Number(e.target.value))} />
            </label>
            <label>
              Duration (min)
              <input type="number" min={5} max={60} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
            </label>
          </div>
          <div className="row wizard-actions">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!castReady}>
              Continue to Review
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card stack">
          <h2>Step 3: Review and Launch</h2>
          <p><strong>Source:</strong> {value}</p>
          {parsed.sourceTitle ? <p><strong>Title:</strong> {parsed.sourceTitle}</p> : null}
          <p><strong>Mode:</strong> {parsed.mode ?? "-"}</p>
          <p><strong>Claim:</strong> {parsed.claim}</p>
          <p><strong>Tensions:</strong> {parsed.tensions.join(" | ")}</p>
          <p><strong>Moderator:</strong> {moderatorId}</p>
          <p><strong>Panel:</strong> {panelistIds.join(", ")}</p>
          <p><strong>Tone:</strong> S {Math.round(seriousness * 100)} / H {Math.round(humor * 100)} / C {Math.round(confrontation * 100)}</p>
          <div className="row wizard-actions">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={launchShow} disabled={busy || !sourceReady || !castReady}>
              {busy ? "Launching..." : "Launch Live Show"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="card"><p>{error}</p></div> : null}
    </div>
  );
}
