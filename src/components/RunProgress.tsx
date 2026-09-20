'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Run progress (AC-02).
 *
 * Polls the run endpoint rather than holding a request open, which is what
 * lets the evaluation outlive any single HTTP connection. When the run reaches
 * a terminal state the page is refreshed so the server can render the
 * completed analysis.
 */

interface RunState {
  status: string;
  stageIndex: number;
  stageLabel: string;
  progress: number;
  stages: string[];
  done: boolean;
  error: string | null;
  errorDetails: string[] | null;
  retryCount: number;
}

const POLL_MS = 2000;

export function RunProgress({ runId }: { runId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RunState | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));

        const next = (await response.json()) as RunState;
        if (cancelled) return;

        setUnreachable(false);
        setState(next);

        if (next.done) {
          router.refresh();
          return;
        }
      } catch {
        if (cancelled) return;
        // Transient network failures should not abandon a run that is still
        // progressing server-side; keep polling and tell the user.
        setUnreachable(true);
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, router]);

  if (state?.status === 'failed') {
    return (
      <div className="card" role="alert">
        <div className="eyebrow" style={{ color: 'var(--negative)' }}>
          Evaluation failed
        </div>
        <h3>{state.error ?? 'The evaluation could not be completed.'}</h3>
        {state.errorDetails && state.errorDetails.length > 0 ? (
          <details>
            <summary className="small">Technical detail</summary>
            <ul className="mono">
              {state.errorDetails.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="muted small">
          Your idea was saved. Use &ldquo;Run again&rdquo; to retry without re-entering anything.
        </p>
      </div>
    );
  }

  const stages = state?.stages ?? ['Understanding idea'];
  const current = state?.stageIndex ?? 0;
  const percent = Math.round((state?.progress ?? 0.02) * 100);

  return (
    <div className="card">
      <div className="eyebrow">Evaluation in progress</div>
      <h3 aria-live="polite">{state?.stageLabel ?? 'Starting...'}</h3>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Evaluation progress"
      >
        <div className="progress-bar" style={{ width: `${percent}%` }} />
      </div>

      <ol className="stage-list">
        {stages.map((stage, i) => (
          <li
            key={stage}
            data-state={i < current ? 'done' : i === current ? 'active' : 'pending'}
          >
            <span className="stage-dot" aria-hidden="true" />
            {stage}
          </li>
        ))}
      </ol>

      {state && state.retryCount > 0 ? (
        <p className="small muted">
          Retried {state.retryCount} time{state.retryCount === 1 ? '' : 's'} after an upstream
          failure.
        </p>
      ) : null}

      {unreachable ? (
        <p className="small muted" role="status">
          Lost contact with the server. The evaluation is still running; reconnecting...
        </p>
      ) : null}

      <p className="small muted">
        Research and synthesis typically take a few minutes. You can close this page and come back
        to it from your workspace.
      </p>
    </div>
  );
}
