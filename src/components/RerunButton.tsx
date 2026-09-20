'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Starts a fresh run of a saved opportunity. Prior versions are retained
 * (FR-11, AC-08), which the confirmation copy makes explicit.
 */
export function RerunButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/rerun`, { method: 'POST' });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not start a new run.');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="button button--secondary" onClick={rerun} disabled={busy}>
        {busy ? 'Starting...' : 'Run again'}
      </button>
      {error ? (
        <span role="alert" className="small" style={{ color: 'var(--negative)' }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
