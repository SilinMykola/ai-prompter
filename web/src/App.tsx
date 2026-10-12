import { useEffect, useState } from 'react';
import type { SessionState } from '@ai-prompter/shared/protocol';

type Health = 'checking' | 'ok' | 'down';

// A function component: a plain function that returns JSX.
// This placeholder only checks that the page can reach the server through the proxy.
export function App() {
  // useState keeps a value between renders; setHealth schedules a re-render.
  const [health, setHealth] = useState<Health>('checking');

  // useEffect runs after the first render. The empty [] means "run once on mount".
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { ok: boolean }) => setHealth(body.ok ? 'ok' : 'down'))
      .catch(() => setHealth('down'));
  }, []);

  // Same type as on the server: both sides import it from the shared protocol.
  const session: SessionState = 'stopped';

  return (
    <main>
      <h1>AI Prompter</h1>
      <p>Server: {health}</p>
      <p>Session: {session}</p>
    </main>
  );
}
