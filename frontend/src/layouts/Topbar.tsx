import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarRange, CircleUserRound, KeyRound, LogOut, UserRound } from 'lucide-react';
import { ApiStatus } from '@/components/ApiStatus';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useAuth } from '@/app/AuthProvider';
import { useFinancialYear } from '@/app/FinancialYearProvider';

/** Global search, environment status and the account menu. */
export const Topbar = () => {
  const { user, logout } = useAuth();
  const { years, selection, setSelection, isLoading } = useFinancialYear();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-topbar">
      <GlobalSearch />

      <div className="app-topbar__spacer" />

      {user && (
        <label className="d-flex align-items-center gap-2 mb-0">
          <CalendarRange size={16} className="text-secondary" aria-hidden />
          <span className="visually-hidden">Financial year</span>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', maxWidth: '14rem' }}
            aria-label="Financial year"
            value={selection === 'ALL' ? 'ALL' : String(selection)}
            disabled={isLoading}
            onChange={(event) =>
              setSelection(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))
            }
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.code}
                {year.isCurrent ? ' (current)' : ''}
              </option>
            ))}
            <option value="ALL">All financial years</option>
          </select>
        </label>
      )}

      <ApiStatus />

      {user && (
        <div className="dropdown">
          <button
            type="button"
            className="btn btn-sm btn-light d-flex align-items-center gap-2"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <CircleUserRound size={16} aria-hidden />
            <span className="d-none d-md-inline">{user.name}</span>
          </button>

          {menuOpen && (
            <>
              {/* Click-away target, so the menu closes without a global listener. */}
              <div
                className="position-fixed top-0 start-0 w-100 h-100"
                style={{ zIndex: 1 }}
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <ul
                className="dropdown-menu dropdown-menu-end show mt-1"
                style={{ position: 'absolute', right: 0, zIndex: 2 }}
                role="menu"
              >
                <li className="px-3 py-2 border-bottom">
                  <div className="fw-medium">{user.name}</div>
                  <div className="small text-secondary">{user.email}</div>
                  <div className="small text-secondary">
                    {user.role.name}
                    {user.role.isReadOnly && ' · read only'}
                  </div>
                </li>
                <li>
                  <Link className="dropdown-item" to="/profile" onClick={() => setMenuOpen(false)}>
                    <UserRound size={15} className="me-2" aria-hidden />
                    Your profile
                  </Link>
                </li>
                <li>
                  <Link
                    className="dropdown-item"
                    to="/change-password"
                    onClick={() => setMenuOpen(false)}
                  >
                    <KeyRound size={15} className="me-2" aria-hidden />
                    Change password
                  </Link>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => void handleLogout()}
                  >
                    <LogOut size={15} className="me-2" aria-hidden />
                    Sign out
                  </button>
                </li>
              </ul>
            </>
          )}
        </div>
      )}
    </header>
  );
};
