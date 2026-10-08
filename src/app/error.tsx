"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="workspace-content">
      <div className="page-shell">
        <p className="page-eyebrow">Campus Workspace</p>
        <h1 className="page-title">We couldn’t load this view</h1>
        <p className="page-description">Your account and data are unchanged. Try again, or return to the workspace.</p>
        <button className="btn btn-primary" onClick={() => reset()} style={{ marginTop: 16 }}>Try again</button>
      </div>
    </main>
  );
}
