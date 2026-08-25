import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleUserRound, KeyRound, LogOut, Search, UserRound } from 'lucide-react';
import { ApiStatus } from '@/components/ApiStatus';
import { SEARCH_PLACEHOLDER } from '@/constants/app';
import { useAuth } from '@/app/AuthProvider';

/**
 * Global search, environment status and the account menu. Search is wired up in
 * Phase 7, once there are documents to find.
 */
export const Topbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-topbar">
      <div className="app-topbar__search">
        <div className="input-group input-group-sm">
          <span className="input-group-text bg-white border-end-0" id="global-search-icon">
            <Search size={15} aria-hidden />
          </span>
          <input
            type="search"
            className="form-control border-start-0"
            placeholder={SEARCH_PLACEHOLDER}
            aria-label="Global search"
            aria-describedby="global-search-icon"
            disabled
            title="Global search arrives in Phase 7"
          />
        </div>
      </div>

      <div className="app-topbar__spacer" />

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
