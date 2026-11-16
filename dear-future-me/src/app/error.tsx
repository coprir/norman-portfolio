"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <h1 className="display text-5xl">Something went wrong.</h1>
        <p className="mt-4 text-silver">It's on our side, and your memories are safe. Please try again.</p>
        <button type="button" onClick={reset} className="mt-8 inline-flex h-11 items-center rounded-full bg-paper px-5 text-sm font-medium text-ink hover:bg-white">Try again</button>
        {error.digest && <p className="mt-6 font-mono text-xs text-mute">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
