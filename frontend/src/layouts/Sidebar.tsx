import { NavLink } from 'react-router-dom';
import { NAV_GROUPS, navVisibilityPermission } from '@/constants/navigation';
import { APP_SHORT_NAME, APP_TITLE } from '@/constants/app';
import { useAuth } from '@/app/AuthProvider';

/**
 * Rendered from the navigation manifest, filtered by the signed-in user's
 * permissions. The Finance Viewer's narrower application is therefore a consequence
 * of the permission data rather than a second hard-coded menu.
 */
export const Sidebar = () => {
  const { hasPermission } = useAuth();

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(navVisibilityPermission(item))),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__brand">
        <span className="app-sidebar__mark" aria-hidden>
          {APP_SHORT_NAME}
        </span>
        <span>{APP_TITLE}</span>
      </div>

      <nav className="app-sidebar__nav" aria-label="Main navigation">
        {groups.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`}>
            {group.label && <div className="app-sidebar__group">{group.label}</div>}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `app-sidebar__link${isActive ? ' is-active' : ''}`}
              >
                <item.icon size={16} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="app-sidebar__footer">Internal use only</div>
    </aside>
  );
};
