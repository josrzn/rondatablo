"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ExportResult = {
  exportDir: string;
  files: string[];
};

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    if (typeof params.id === "string") {
      setEpisodeId(params.id);
    }
  }, [params]);

  async function runExport() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/episodes/${episodeId}/export`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Export failed");
      }
      setResult(data as ExportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h1>Export & Publish Pack</h1>
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
        </div>
        <p className="mono">{episodeId}</p>
      </div>
      <div className="card stack">
        <div className="row control-row">
          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={runExport}
            disabled={busy || !episodeId}
          >
            {busy ? "Exporting..." : "Generate Export Pack"}
          </button>
          <Link href={`/live/${episodeId}`} className="btn btn-secondary btn-compact">
            Back to Live Studio
          </Link>
        </div>
        {error ? <p className="monitor-warning">{error}</p> : null}
      </div>
      <div className="card stack">
        <h2>Result</h2>
        {result ? (
          <>
            <p>
              <strong>Directory:</strong> <span className="mono">{result.exportDir}</span>
            </p>
            <p>
              <strong>Files:</strong> {result.files.join(", ")}
            </p>
          </>
        ) : (
          <p>No export generated yet.</p>
        )}
      </div>
    </div>
  );
}
