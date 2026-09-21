import { applicationHtmlPlugin } from './application-html.js';
import cesium from 'vite-plugin-cesium';

/** Build browser assets with explicit inputs; never load environment or providers. */
export function createBrowserViteConfig({
  plugins = [],
  publicDir,
  googleApiKey,
  cesiumToken,
  host = 'localhost',
  port = 4173,
} = {}) {
  const resolvedHost = host || 'localhost';
  const resolvedPort = parseInt(port, 10) || 4173;
  /*
   * A bound host is a shared host. On 0.0.0.0 the request's Host header is
   * whatever the platform put in front of us — a LAN address, or a hosting
   * provider's generated domain — and none of those can be enumerated here.
   * Bound to loopback the allowlist stays closed.
   */
  const allowedHosts =
    resolvedHost === '0.0.0.0' || resolvedHost === '::'
      ? true
      : ['localhost', '127.0.0.1', '.local'];
  return {
    plugins: [cesium(), applicationHtmlPlugin(), ...plugins],
    ...(publicDir === undefined ? {} : { publicDir }),
    server: {
      host: resolvedHost,
      port: resolvedPort,
      allowedHosts,
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ENVIRONMENT'],
      },
      // These headers protect the document containing Provider Settings.
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
    /*
     * The production server. `vite preview` serves the built bundle AND every
     * provider plugin — they all register `configurePreviewServer`, so the
     * /api proxies the map layers depend on are live here, while the Provider
     * Settings panel deliberately is not (it pins itself to
     * `serve && !isPreview`, so a hosted instance cannot be asked which keys
     * exist, let alone given one).
     *
     * Vite does NOT inherit `server.port` into preview: without this block a
     * hosted deployment binds 4173 while the platform waits on $PORT, and the
     * service is marked unhealthy while the process runs perfectly.
     */
    preview: {
      host: resolvedHost,
      port: resolvedPort,
      allowedHosts,
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(googleApiKey),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(cesiumToken),
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
}
