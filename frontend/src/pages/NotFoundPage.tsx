import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';

export const NotFoundPage = () => (
  <>
    <PageHeader title="Page not found" />
    <div className="phase-stub">
      <p className="mb-3">That address does not match any screen in this application.</p>
      <Link className="btn btn-sm btn-primary" to="/">
        Back to the dashboard
      </Link>
    </div>
  </>
);
