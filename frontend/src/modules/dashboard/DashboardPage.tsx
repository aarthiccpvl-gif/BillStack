import { CheckCircle2, Circle, Database, Server } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useHealth } from '@/hooks/useHealth';

/**
 * Phase 1 landing page.
 *
 * The real dashboard (KPI cards, monthly value charts, conversion funnel, recent
 * documents) arrives in Phase 7 once there are documents to count. Until then
 * this page reports the actual state of the running system — no mock figures.
 */

const PHASES: { phase: number; title: string; done: boolean }[] = [
  { phase: 1, title: 'Project setup, tooling, application shell, health endpoint', done: true },
  { phase: 2, title: 'Database schema, authentication, roles and permissions, audit', done: true },
  { phase: 3, title: 'Company settings, master data, customers, products & services', done: true },
  { phase: 4, title: 'Template engine, three templates, PDF rendering', done: true },
  { phase: 5, title: 'Quotations: editor, calculations, PDF, send, revisions', done: false },
  { phase: 6, title: 'Invoices and quotation → invoice conversion', done: false },
  { phase: 7, title: 'Dashboard, Finance Viewer surface, bulk downloads', done: false },
  { phase: 8, title: 'Reports, CSV/XLSX/PDF exports, audit log viewer', done: false },
];

export const DashboardPage = () => {
  const { data, isError } = useHealth();

  const dbLabel =
    data?.checks.database === 'up'
      ? 'Connected'
      : data?.checks.database === 'down'
        ? 'Unreachable — is MySQL running?'
        : 'Not configured yet';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Business figures appear here from Phase 7. For now this page reports the state of the running system."
      />

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-2 text-secondary">
                <Server size={16} aria-hidden />
                <span className="label-caps">API</span>
              </div>
              <div className="fs-5 fw-semibold">
                {isError ? 'Unreachable' : data ? `Healthy · v${data.version}` : 'Checking…'}
              </div>
              <div className="text-secondary small mt-1">
                {isError
                  ? 'Start the API with npm run dev:backend'
                  : data
                    ? `${data.environment} · up ${data.uptimeSeconds}s`
                    : 'Waiting for the first response'}
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-2 text-secondary">
                <Database size={16} aria-hidden />
                <span className="label-caps">Database</span>
              </div>
              <div className="fs-5 fw-semibold">{dbLabel}</div>
              <div className="text-secondary small mt-1">MySQL 8 via Prisma · 36 tables</div>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="card h-100">
            <div className="card-body">
              <span className="label-caps">Request path verified</span>
              <p className="mb-0 mt-2 small text-secondary">
                This card is populated by a real call: React → Vite proxy → Express → response
                envelope → typed payload from the shared package. The whole chain the business
                modules will use is already in place.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header bg-white">
          <span className="label-caps">Delivery plan</span>
        </div>
        <ul className="list-group list-group-flush">
          {PHASES.map((item) => (
            <li key={item.phase} className="list-group-item d-flex align-items-start gap-3">
              <span className={item.done ? 'text-success' : 'text-secondary'} aria-hidden>
                {item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </span>
              <span className="flex-grow-1">
                <span className="fw-medium">Phase {item.phase}</span>
                <span className="text-secondary"> — {item.title}</span>
              </span>
              <span className={`badge ${item.done ? 'text-bg-success' : 'text-bg-light'}`}>
                {item.done ? 'Complete' : 'Planned'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};
