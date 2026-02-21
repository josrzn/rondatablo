import Link from "next/link";

export default function HomePage() {
  return (
    <div className="stack">
      <div className="card stack hero-card">
        <h1>Rondatablo Pilot v0</h1>
        <p>
          Build a show from a source, cast the room, and launch a live debate
          session with export-ready assets.
        </p>
        <div className="row">
          <Link className="cta-link" href="/new-show">
            Create New Show
          </Link>
        </div>
      </div>
    </div>
  );
}
