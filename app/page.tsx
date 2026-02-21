import Link from "next/link";

export default function HomePage() {
  return (
    <div className="stack">
      <div className="card stack">
        <h1>Rondatablo Pilot v0</h1>
        <p>
          Local-first environment for producing live AI debates from source
          links or text, with cast control and export packs.
        </p>
      </div>
      <div className="card stack">
        <h2>Start</h2>
        <div className="row">
          <Link href="/intake">1) Source Intake</Link>
          <Link href="/cast">2) Cast Builder</Link>
        </div>
      </div>
    </div>
  );
}
