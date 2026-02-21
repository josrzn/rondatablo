"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ParseSourceResponse, SourceType } from "@/lib/types";

const EMPTY_PARSE: ParseSourceResponse = {
  claim: "",
  tensions: [],
  openQuestions: []
};

export default function IntakePage() {
  const [sourceType, setSourceType] = useState<SourceType>("url");
  const [value, setValue] = useState("");
  const [parsed, setParsed] = useState<ParseSourceResponse>(EMPTY_PARSE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canContinue = useMemo(() => {
    return Boolean(value.trim() && parsed.claim);
  }, [value, parsed.claim]);

  async function parse() {
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
        throw new Error(data.error ?? "Parse failed");
      }
      setParsed(data as ParseSourceResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  function saveDraft() {
    localStorage.setItem(
      "rt_source_draft",
      JSON.stringify({
        sourceType,
        value,
        parsed
      })
    );
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h1>Source Intake</h1>
        <p>Paste a source URL or text and extract debate fault lines.</p>
      </div>
      <div className="card stack">
        <label>
          Source type
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}
          >
            <option value="url">URL</option>
            <option value="text">Raw text</option>
          </select>
        </label>
        <label>
          Source value
          <textarea
            rows={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://... or a text excerpt"
          />
        </label>
        <div className="row">
          <button onClick={parse} disabled={busy || !value.trim()}>
            {busy ? "Parsing..." : "Extract Claims"}
          </button>
          <button
            onClick={saveDraft}
            disabled={!canContinue}
            title="Saves parsed source into localStorage"
          >
            Save Draft
          </button>
          <Link href="/cast">Go to Cast Builder</Link>
        </div>
        {error ? <p>{error}</p> : null}
      </div>
      <div className="card stack">
        <h2>Parse Preview</h2>
        <p>
          <strong>Claim:</strong> {parsed.claim || "No parsed claim yet."}
        </p>
        <p>
          <strong>Tensions:</strong>{" "}
          {parsed.tensions.length > 0 ? parsed.tensions.join(" | ") : "-"}
        </p>
        <p>
          <strong>Open questions:</strong>{" "}
          {parsed.openQuestions.length > 0 ? parsed.openQuestions.join(" | ") : "-"}
        </p>
      </div>
    </div>
  );
}
