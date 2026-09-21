/**
 * Serve and ship the Nepal case artefacts.
 *
 * The validated Stage 0–5 artefacts live in `data/`, outside Vite's public
 * directory, and are committed because reproducibility was judged to matter
 * more than a tidy repository. Two ways to get them to the browser were
 * available and only one avoids duplicating 15 MB in source control:
 *
 *   1. Copy them into `public/` — duplicates every artefact in git.
 *   2. Serve them from where they are, and copy into `dist/` at build time.
 *
 * This is (2). The URL is `/data/...` in dev, preview and production alike, so
 * no code has to know which mode it is running in.
 *
 * ONLY JSON, ONLY FROM `data/analysis` AND `data/processed`. The middleware
 * refuses anything else: `data/raw` holds an 82 MB GeoTIFF and a NonCommercial
 * archive that must not be served, and a path that escapes the directory must
 * not be resolvable at all.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The two directories that may be served, and nothing else. */
export const SERVED_DIRECTORIES = Object.freeze(['analysis', 'processed']);

/**
 * Resolve a request path to a file, or null if it may not be served.
 *
 * Exported so the rule is testable without a server. The checks are ordered
 * cheapest-first, and the containment check is last because it is the one that
 * must hold even if every earlier check were wrong.
 */
export function resolveDataRequest(urlPath, root = ROOT) {
  if (typeof urlPath !== 'string') return null;
  const [withoutQuery] = urlPath.split('?');
  let decoded;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    /* A path that will not decode is not a path we serve. */
    return null;
  }
  if (!decoded.startsWith('/data/')) return null;
  if (!decoded.endsWith('.json')) return null;
  if (decoded.includes('\0')) return null;

  const relative = decoded.slice('/data/'.length);
  const [directory, ...rest] = relative.split('/');
  if (!SERVED_DIRECTORIES.includes(directory)) return null;
  if (rest.length !== 1 || rest[0] === '') return null;

  const base = path.join(root, 'data', directory);
  const target = path.join(base, rest[0]);
  /*
   * The containment check. `path.join` collapses `..`, so this catches an
   * escape even if the segment checks above were loosened later.
   */
  const relativeToBase = path.relative(base, target);
  if (relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase)) return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  return target;
}

function middleware(root) {
  return (req, res, next) => {
    const file = resolveDataRequest(req.url ?? '', root);
    if (!file) {
      next();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    /*
     * The artefacts are immutable for a given build — they are committed data,
     * not a feed — so a long cache is correct and makes scene revisits free.
     */
    res.setHeader('Cache-Control', 'public, max-age=3600');
    createReadStream(file).pipe(res);
  };
}

/**
 * The plugin.
 *
 * Registers on BOTH the dev server and the preview server: `vite preview`
 * serves the built bundle, and a deployment that only worked in dev would fail
 * exactly where it matters.
 */
export function nepalDataPlugin({ root = ROOT } = {}) {
  return {
    name: 'nepal-case-artefacts',
    configureServer(server) {
      server.middlewares.use(middleware(root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(root));
    },
    /*
     * Copy into the bundle at the end of the build, so a static host serves
     * them without the middleware. `data/raw` is never copied.
     */
    async closeBundle() {
      const outDir = path.join(root, 'dist', 'data');
      for (const directory of SERVED_DIRECTORIES) {
        const from = path.join(root, 'data', directory);
        if (!existsSync(from)) continue;
        await mkdir(path.join(outDir, directory), { recursive: true });
        await cp(from, path.join(outDir, directory), { recursive: true });
      }
    },
  };
}
