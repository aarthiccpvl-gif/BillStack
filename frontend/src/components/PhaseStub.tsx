import { Construction } from 'lucide-react';
import { PageHeader } from './PageHeader';

interface PhaseStubProps {
  title: string;
  phase: number;
  summary: string;
  /** What this screen will actually do, so the placeholder still documents intent. */
  scope?: string[];
}

/**
 * Honest placeholder for a module that a later phase delivers. It states which
 * phase owns the screen rather than pretending to be a working page — no mock
 * data anywhere in this application.
 */
export const PhaseStub = ({ title, phase, summary, scope }: PhaseStubProps) => (
  <>
    <PageHeader title={title} />
    <div className="phase-stub">
      <span className="phase-stub__phase">Phase {phase}</span>
      <div className="mb-2 text-secondary">
        <Construction size={22} aria-hidden />
      </div>
      <p className="mb-2 fw-medium text-dark">{summary}</p>
      {scope && scope.length > 0 && (
        <ul className="list-unstyled small mb-0">
          {scope.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  </>
);
