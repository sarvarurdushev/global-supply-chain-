import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInfoPlugin, resolveBuildInfo } from '../../build/build-info.js';

const FIXED = () => new Date('2026-09-29T00:00:00Z');

test('the host-provided commit wins, so a deployment stamps what it built', () => {
  const info = resolveBuildInfo({
    env: {
      RENDER_GIT_COMMIT: 'a'.repeat(40),
      RENDER_GIT_BRANCH: 'claude/supply-chain-intelligence-platform-5u3va2',
    },
    now: FIXED,
    run: (args) => (args[0] === 'status' ? '' : 'from-git'),
  });
  assert.equal(info.commit, 'a'.repeat(40));
  assert.equal(info.shortCommit, 'aaaaaaa');
  assert.equal(info.branch, 'claude/supply-chain-intelligence-platform-5u3va2');
  assert.equal(info.dirty, false);
  assert.equal(info.builtAt, '2026-09-29T00:00:00.000Z');
});

test('without a host, git answers; a modified checkout says so', () => {
  const info = resolveBuildInfo({
    env: {},
    now: FIXED,
    run: (args) =>
      ({ 'rev-parse HEAD': 'b'.repeat(40), 'rev-parse --abbrev-ref HEAD': 'main' })[
        args.join(' ')
      ] ?? ' M src/main.js',
  });
  assert.equal(info.commit, 'b'.repeat(40));
  assert.equal(info.branch, 'main');
  assert.equal(info.dirty, true);
});

test('outside a checkout the stamp says unknown rather than failing the build', () => {
  const info = resolveBuildInfo({ env: {}, now: FIXED, run: () => null });
  assert.equal(info.commit, 'unknown');
  assert.equal(info.shortCommit, 'unknown');
  assert.equal(info.dirty, null);
});

test('the plugin writes version.json and a build-commit meta tag', () => {
  const plugin = buildInfoPlugin({
    env: { RENDER_GIT_COMMIT: 'c'.repeat(40), RENDER_GIT_BRANCH: 'x' },
    now: FIXED,
    run: () => '',
  });
  assert.equal(plugin.apply, 'build');
  plugin.buildStart();
  const [meta] = plugin.transformIndexHtml();
  assert.deepEqual(meta.attrs, { name: 'build-commit', content: 'c'.repeat(40) });
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  assert.equal(emitted[0].fileName, 'version.json');
  assert.equal(JSON.parse(emitted[0].source).commit, 'c'.repeat(40));
});
