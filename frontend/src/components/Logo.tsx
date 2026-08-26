import { APP_TAGLINE, APP_TITLE } from '@/constants/app';

/**
 * The brand mark.
 *
 * A document with a torn receipt edge, and a rising line cut through it: the two
 * things this application is actually about — the paper you send someone, and
 * whether the money is going up. The rising line is the lime accent, which is
 * the only place that colour appears at this size, so the mark is recognisable
 * in a browser tab at 16px.
 *
 * Drawn rather than imported: an SVG in the bundle needs no network request, is
 * crisp at every size, and inherits the theme's own colours.
 */

const MARK_ID = 'app-logo-gradient';

export const LogoMark = ({ size = 28, title }: { size?: number; title?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role={title ? 'img' : 'presentation'}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    style={{ flex: `0 0 ${size}px` }}
  >
    <defs>
      <linearGradient id={MARK_ID} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1E6A46" />
        <stop offset="1" stopColor="#0C2A1C" />
      </linearGradient>
    </defs>

    {/* The tile. */}
    <rect width="32" height="32" rx="9" fill={`url(#${MARK_ID})`} />

    {/* The document, with the zig-zag a receipt tears along. */}
    <path
      d="M9 8.5A1.5 1.5 0 0 1 10.5 7h11A1.5 1.5 0 0 1 23 8.5v14.2l-2.33-1.6-2.34 1.6-2.33-1.6-2.34 1.6-2.33-1.6L9 22.7V8.5Z"
      fill="#FFFFFF"
      fillOpacity="0.93"
    />

    {/* The line that rises: three points and an arrowhead, in the accent. */}
    <path
      d="m12.2 17.6 3.1-3.3 2.3 2 3.2-4"
      stroke="#9CCC3C"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.4 12.1h2.8v2.8"
      stroke="#9CCC3C"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Mark plus wordmark. `tagline` is for the places with room to say what the
 * product is — the sign-in screen — and is left off in the sidebar, where the
 * navigation underneath already answers the question.
 */
export const Logo = ({
  size = 28,
  tagline = false,
  className,
}: {
  size?: number;
  tagline?: boolean;
  className?: string;
}) => (
  <span className={`app-logo${className ? ` ${className}` : ''}`}>
    <LogoMark size={size} />
    <span className="app-logo__wordmark">
      {APP_TITLE}
      {tagline && <span className="app-logo__tagline">{APP_TAGLINE}</span>}
    </span>
  </span>
);
