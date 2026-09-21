import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SERVED_DIRECTORIES,
  nepalDataPlugin,
  resolveDataRequest,
} from '../../build/nepal-data.js';
import { createBrowserViteConfig } from '../../build/vite.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('only analysis and processed JSON is servable', () => {
  assert.ok(resolveDataRequest('/data/analysis/nepal-2015-seismic-analysis.json'));
  assert.ok(resolveDataRequest('/data/processed/nepal-2015-shakemap-contours.json'));
  // A query string is normal and must not defeat the match.
  assert.ok(resolveDataRequest('/data/analysis/nepal-2015-seismic-analysis.json?v=2'));
});

test('data/raw is never servable', () => {
  /*
   * The reason this is a test and not a comment: data/raw holds an 82 MB
   * GeoTIFF and a NonCommercial archive. Serving either would breach a licence
   * and ship 82 MB to a browser that never asked for it.
   */
  assert.equal(resolveDataRequest('/data/raw/npl_ppp_2015_UNadj.tif'), null);
  assert.equal(resolveDataRequest('/data/raw/EQ20150425NPL_shp.zip'), null);
  assert.equal(resolveDataRequest('/data/raw/usgs-nepal-2015.geojson'), null);
  assert.equal(SERVED_DIRECTORIES.includes('raw'), false);
});

test('traversal cannot escape the served directories', () => {
  for (const attempt of [
    '/data/analysis/../raw/npl_ppp_2015_UNadj.tif',
    '/data/analysis/%2e%2e/raw/x.json',
    '/data/analysis/..%2Fraw%2Fx.json',
    '/data/processed/../../package.json',
    '/data/../package.json',
    '/etc/passwd',
    '/data/analysis/sub/dir/x.json',
  ]) {
    assert.equal(resolveDataRequest(attempt), null, `${attempt} must not resolve`);
  }
});

test('a malformed or non-JSON request is refused rather than guessed at', () => {
  assert.equal(resolveDataRequest('/data/analysis/x.txt'), null);
  assert.equal(resolveDataRequest('/data/analysis/'), null);
  assert.equal(resolveDataRequest('/data/analysis/%E0%A4%A.json'), null);
  assert.equal(resolveDataRequest(null), null);
  assert.equal(resolveDataRequest(undefined), null);
  assert.equal(resolveDataRequest(42), null);
});

test('a named file that does not exist resolves to null, not to a 200', () => {
  assert.equal(resolveDataRequest('/data/analysis/not-a-real-artefact.json'), null);
});

test('the plugin registers on both the dev and the preview server', () => {
  /*
   * Preview is what a deployment runs. A plugin that only registered on the dev
   * server would work locally and fail in production on the first panel.
   */
  const plugin = nepalDataPlugin();
  assert.equal(plugin.name, 'nepal-case-artefacts');
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal(typeof plugin.configurePreviewServer, 'function');
  assert.equal(typeof plugin.closeBundle, 'function');

  const used = [];
  const fakeServer = { middlewares: { use: (fn) => used.push(fn) } };
  plugin.configureServer(fakeServer);
  plugin.configurePreviewServer(fakeServer);
  assert.equal(used.length, 2);
});

test('the middleware serves a real artefact and passes everything else through', async () => {
  const plugin = nepalDataPlugin();
  let handler = null;
  plugin.configureServer({ middlewares: { use: (fn) => { handler = fn; } } });

  // A path it does not own must call next() and write nothing.
  let nexted = false;
  handler({ url: '/index.html' }, { setHeader() {} }, () => { nexted = true; });
  assert.equal(nexted, true);

  // A path it owns must set JSON headers and stream.
  const headers = {};
  const chunks = [];
  const res = {
    setHeader(key, value) { headers[key] = value; },
    on() {}, once() {}, emit() {}, end() {},
    write(chunk) { chunks.push(chunk); return true; },
  };
  await new Promise((resolve) => {
    const original = res.end;
    res.end = (...args) => { original.call(res, ...args); resolve(); };
    handler(
      { url: '/data/analysis/nepal-2015-seismic-analysis.json' },
      res,
      () => resolve(),
    );
  });
  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
  assert.match(headers['Cache-Control'], /max-age/);
});

test('the browser config includes the artefact plugin by default', () => {
  const config = createBrowserViteConfig();
  const names = config.plugins.flat().map((plugin) => plugin?.name).filter(Boolean);
  assert.ok(
    names.includes('nepal-case-artefacts'),
    `expected the artefact plugin among: ${names.join(', ')}`,
  );
});

test('every served directory exists in the repository', () => {
  for (const directory of SERVED_DIRECTORIES) {
    assert.ok(
      existsSync(path.join(ROOT, 'data', directory)),
      `data/${directory} is declared servable but does not exist`,
    );
  }
});
