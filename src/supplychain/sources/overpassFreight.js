/**
 * Overpass transport for the freight infrastructure layers.
 *
 * Posts through the app's own `/api/overpass` proxy rather than to
 * overpass-api.de directly. That is not a preference — it is the only thing
 * that works and the only thing that is safe:
 *
 *   - The proxy validates every query against
 *     `server/providers/overpass/query.js`, which requires each selector to be
 *     individually bounded and rejects world-sized boxes. A layer that talked
 *     to the API directly would bypass that.
 *   - It caches on disk, rotates across mirrors, and rate-limits. The public
 *     API bans clients that hammer it, and a camera-driven layer is exactly the
 *     shape of client that gets banned.
 *   - It sets a real User-Agent. Measured directly: overpass-api.de answers
 *     HTTP 406 to a request without one.
 *
 * Nothing here interprets the payload. Decoding lives in
 * `supplychain/freight.js`, which is portable and tested without a network.
 */

/** Overpass mirrors can be slow under load; the proxy caps its own QL timeout. */
const REQUEST_TIMEOUT_MS = 40_000;

/**
 * Create the transport.
 *
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {string} [deps.endpoint]
 * @returns {(query:string, options?:{signal?:AbortSignal})=>Promise<object>}
 */
export function createOverpassFreightSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/overpass',
} = {}) {
  return async function fetchOverpass(query, { signal } = {}) {
    if (typeof query !== 'string' || query.length === 0) {
      throw new TypeError('An Overpass query is required');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signals = [signal, controller.signal].filter(Boolean);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.any(signals),
      });
      if (!response.ok) {
        /*
         * 429 is distinguished because it means "come back later", not "this
         * query is wrong". The layer surfaces the difference: a rate limit is
         * a wait, a 400 is a bug, and telling a user to wait when the query is
         * malformed wastes their time.
         */
        throw new Error(
          response.status === 429
            ? 'OpenStreetMap is rate-limiting this view. Wait a moment and move the camera again.'
            : `OpenStreetMap query failed (HTTP ${response.status}).`,
        );
      }
      const payload = await response.json();
      if (!Array.isArray(payload?.elements)) {
        throw new Error('OpenStreetMap returned a malformed response.');
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError' && controller.signal.aborted) {
        throw new Error(
          'OpenStreetMap did not answer in time. Try a smaller area.',
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
