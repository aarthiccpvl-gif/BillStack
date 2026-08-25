import type { Express, RequestHandler } from 'express';
import { PERMISSION_TAG, type TaggedHandler } from '../middleware/authorize';
import { logger } from '../utils/logger';

/**
 * Startup proof that no mutating route shipped without a declared permission.
 *
 * Every guard produced by `requirePermission` / `authenticatedOnly` / `publicRoute`
 * carries a tag. This walks the mounted router and fails the boot if a POST, PATCH,
 * PUT or DELETE route has none — so forgetting a guard is a startup error rather
 * than a security hole discovered later.
 *
 * It reads Express internals, which are stable in Express 4 but not part of its
 * public API; if the shape ever changes, the check degrades to a warning rather
 * than blocking the application from starting.
 */

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

interface RouteInfo {
  method: string;
  path: string;
  tagged: boolean;
}

interface ExpressLayer {
  name?: string;
  regexp?: { source: string };
  route?: {
    path: string | string[];
    stack: { handle: RequestHandler; method?: string }[];
    methods: Record<string, boolean>;
  };
  handle?: { stack?: ExpressLayer[] };
}

/** Turns a mounted router's regexp back into a readable path fragment. */
const layerPrefix = (layer: ExpressLayer): string => {
  const source = layer.regexp?.source;
  if (!source || source === '^\\/?$' || source === '^\\/?(?=\\/|$)') return '';
  const match = /^\^\\\/((?:[\w\-.~%]|\\.)*)/.exec(source);
  if (!match?.[1]) return '';
  return `/${match[1].replace(/\\(.)/g, '$1')}`;
};

/** "/api//health//" → "/api/health" */
const normalisePath = (path: string): string => {
  const collapsed = `/${path}`.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';
};

const collect = (layers: ExpressLayer[], prefix: string, out: RouteInfo[]): void => {
  for (const layer of layers) {
    if (layer.route) {
      const routePath = Array.isArray(layer.route.path)
        ? (layer.route.path[0] ?? '')
        : layer.route.path;

      const tagged = layer.route.stack.some(
        (entry) => (entry.handle as TaggedHandler)[PERMISSION_TAG] !== undefined,
      );

      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled) out.push({ method, path: normalisePath(`${prefix}${routePath}`), tagged });
      }
      continue;
    }

    if (layer.handle?.stack) {
      collect(layer.handle.stack, `${prefix}${layerPrefix(layer)}`, out);
    }
  }
};

export const collectRoutes = (app: Express): RouteInfo[] => {
  const out: RouteInfo[] = [];
  try {
    const stack = (app as unknown as { _router?: { stack?: ExpressLayer[] } })._router?.stack;
    if (!stack) return out;
    collect(stack, '', out);
  } catch (error) {
    logger.warn({ err: error }, 'could not introspect the router to verify route guards');
  }
  return out;
};

export const assertRoutesProtected = (app: Express): void => {
  const routes = collectRoutes(app);

  if (routes.length === 0) {
    logger.warn('route guard check skipped — the router could not be introspected');
    return;
  }

  const unguarded = routes.filter((route) => MUTATING_METHODS.has(route.method) && !route.tagged);

  if (unguarded.length > 0) {
    const list = unguarded
      .map((route) => `  ${route.method.toUpperCase()} ${route.path}`)
      .join('\n');
    throw new Error(
      `These routes change data but declare no permission:\n${list}\n` +
        'Add requirePermission(...) — or publicRoute()/authenticatedOnly() if that is genuinely intended.',
    );
  }

  logger.debug(
    {
      routes: routes.length,
      mutating: routes.filter((r) => MUTATING_METHODS.has(r.method)).length,
    },
    'route guard check passed',
  );
};
