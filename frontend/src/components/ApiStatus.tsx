import { useHealth } from '@/hooks/useHealth';

const DB_LABELS: Record<string, string> = {
  up: 'database connected',
  down: 'database unreachable',
  not_configured: 'database not configured',
};

/**
 * Topbar connectivity indicator. Colour is never the only signal — the label
 * always says what the state is.
 */
export const ApiStatus = () => {
  const { data, isLoading, isError } = useHealth();

  if (isLoading) {
    return (
      <span className="app-status" aria-live="polite">
        <span className="app-status__dot" />
        Checking API…
      </span>
    );
  }

  if (isError || !data) {
    return (
      <span className="app-status" aria-live="polite">
        <span className="app-status__dot is-down" />
        API unreachable
      </span>
    );
  }

  const tone = data.status === 'ok' ? 'is-up' : 'is-degraded';

  return (
    <span
      className="app-status"
      aria-live="polite"
      title={`v${data.version} · ${data.environment}`}
    >
      <span className={`app-status__dot ${tone}`} />
      API {data.status === 'ok' ? 'healthy' : 'degraded'}
      <span className="text-muted">
        {' '}
        · {DB_LABELS[data.checks.database] ?? data.checks.database}
      </span>
    </span>
  );
};
