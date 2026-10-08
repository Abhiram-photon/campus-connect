import Link from "next/link";

export default function NotFound() {
  return (
    <main className="workspace-content">
      <div className="page-shell">
        <p className="page-eyebrow">Campus Workspace</p>
        <h1 className="page-title">This campus page is unavailable</h1>
        <p className="page-description">The item may have been removed, or your account may not have permission to view it.</p>
        <Link className="btn btn-primary" href="/home" style={{ marginTop: 16 }}>Return to workspace</Link>
      </div>
    </main>
  );
}
