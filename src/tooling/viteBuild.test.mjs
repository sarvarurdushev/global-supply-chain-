import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBrowserViteConfig } from '../../build/vite.js';
import standaloneConfig, * as compatibility from '../../vite.config.js';
import * as providers from '../../server/providers/local.js';

test('explicit build inputs preserve browser-only defines, plugin order and loopback protections', () => {
  const plugin = { name: 'fixture-provider' };
  const config = createBrowserViteConfig({
    plugins: [plugin],
    googleApiKey: 'browser-fixture',
    cesiumToken: 'ion-fixture',
  });
  /*
   * Injected provider plugins come after the three core ones: cesium, the
   * application templates, and the Nepal case artefacts. The artefact plugin
   * is core rather than injected because the committed Stage 0-5 data is the
   * application's subject matter, not an optional provider.
   */
  assert.deepEqual(
    config.plugins.slice(0, 3).map((entry) => entry?.name ?? null),
    [
      'vite-plugin-cesium',
      'application-component-templates',
      'nepal-case-artefacts',
    ],
  );
  assert.equal(config.plugins[3], plugin);
  assert.equal(config.server.host, 'localhost');
  assert.equal(config.server.port, 4173);
  assert.deepEqual(config.server.allowedHosts, [
    'localhost',
    '127.0.0.1',
    '.local',
  ]);
  assert.ok(config.server.fs.deny.includes('**/ENVIRONMENT'));
  assert.ok(config.server.fs.deny.includes('.env.*'));
  assert.equal(config.server.headers['X-Frame-Options'], 'DENY');
  assert.equal(
    config.server.headers['Content-Security-Policy'],
    "frame-ancestors 'none'",
  );
  assert.deepEqual(config.define, {
    'import.meta.env.GOOGLE_MAPS_API_KEY': '"browser-fixture"',
    'import.meta.env.CESIUM_ION_TOKEN': '"ion-fixture"',
  });
  assert.equal(
    createBrowserViteConfig({ host: '0.0.0.0', port: '4800' }).server
      .allowedHosts,
    true,
  );
  assert.equal(
    createBrowserViteConfig({ host: '::', port: '4800' }).server.port,
    4800,
  );
});

test('the preview server binds the host and port a platform assigns', () => {
  /*
   * Vite does not inherit `server.port` into preview. Without an explicit
   * block a hosted deployment binds 4173 while the platform waits on $PORT,
   * and the service is marked unhealthy while the process runs perfectly.
   */
  const hosted = createBrowserViteConfig({ host: '0.0.0.0', port: '10000' });
  assert.equal(hosted.preview.host, '0.0.0.0');
  assert.equal(hosted.preview.port, 10_000);
  assert.equal(hosted.preview.port, hosted.server.port);
  /* A bound host answers on a domain nothing here can enumerate. */
  assert.equal(hosted.preview.allowedHosts, true);
  assert.equal(hosted.preview.headers['X-Frame-Options'], 'DENY');

  /* Bound to loopback the allowlist stays closed, in preview as in dev. */
  const local = createBrowserViteConfig();
  assert.equal(local.preview.host, 'localhost');
  assert.equal(local.preview.port, 4173);
  assert.deepEqual(local.preview.allowedHosts, [
    'localhost',
    '127.0.0.1',
    '.local',
  ]);
});

test('build helper does not discover environment values or construct local providers', () => {
  const before = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'environment-fixture';
  try {
    const config = createBrowserViteConfig();
    assert.equal(
      config.define['import.meta.env.GOOGLE_MAPS_API_KEY'],
      undefined,
    );
    assert.equal(config.plugins.length, 3);
  } finally {
    if (before === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = before;
  }
});

test('root config retains existing named exports and standalone provider order', () => {
  for (const [name, value] of Object.entries(providers))
    assert.equal(compatibility[name], value, name);
  const config = standaloneConfig({ mode: 'test' });
  assert.deepEqual(
    config.plugins.slice(3, -1).map((plugin) => plugin.name),
    providers.localProviderPlugins().map((plugin) => plugin.name),
  );
  assert.equal(config.plugins.at(-2).name, 'gev-key-setup');
  assert.equal(config.plugins.at(-1).name, 'api-not-found');
});

test('build export resolves in Node and has no browser fallback', async () => {
  const exported = await import('gods-eye-view/build/vite');
  assert.equal(exported.createBrowserViteConfig, createBrowserViteConfig);
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  assert.deepEqual(pkg.exports['./build/vite'], { node: './build/vite.js' });
});
