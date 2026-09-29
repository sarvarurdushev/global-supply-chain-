/**
 * Stamp every build with the commit it was built from.
 *
 * "Is the deployed site the version that was tested?" has to be answerable by
 * looking, not by trusting that a deploy happened. The build writes
 * `version.json` next to `index.html` and a `build-commit` meta tag into the
 * page, so the question has the same literal answer on a laptop and on a
 * host: open `/version.json` on both and compare the commit.
 *
 * The commit comes from the host when it says — Render sets
 * `RENDER_GIT_COMMIT` and `RENDER_GIT_BRANCH` during its build, and the
 * standalone config passes exactly those two in as `env` — and from git
 * otherwise. Nothing here reads `process.env` itself. Outside a checkout the
 * commit is `unknown`, which is an honest answer rather than a failed build.
 * `dirty` is true when tracked files differed from that commit at build time,
 * so a stamp never vouches for code it did not see.
 */

import { execFileSync } from 'node:child_process';

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Exported so the rule is testable without running a build. */
export function resolveBuildInfo({
  env = {},
  cwd = process.cwd(),
  now = () => new Date(),
  run = git,
} = {}) {
  const commit = env.RENDER_GIT_COMMIT || run(['rev-parse', 'HEAD'], cwd) || 'unknown';
  const branch =
    env.RENDER_GIT_BRANCH ||
    run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) ||
    'unknown';
  const status = run(['status', '--porcelain', '--untracked-files=no'], cwd);
  return Object.freeze({
    product: 'Natural Disaster Intelligence',
    case: 'NPL-2015-EQ',
    commit,
    shortCommit: commit === 'unknown' ? commit : commit.slice(0, 7),
    branch,
    dirty: status === null ? null : status.length > 0,
    builtAt: now().toISOString(),
  });
}

export function buildInfoPlugin(options) {
  let info = null;
  return {
    name: 'build-info',
    apply: 'build',
    buildStart() {
      info = resolveBuildInfo(options);
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'build-commit', content: info?.commit ?? 'unknown' },
          injectTo: 'head',
        },
      ];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(info, null, 2)}\n`,
      });
    },
  };
}
