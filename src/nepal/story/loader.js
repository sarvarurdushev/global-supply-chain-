/**
 * The artefact loader: the one place the Nepal case reaches the network.
 *
 * Everything else in `src/nepal/` takes values. This module takes URLs and
 * returns values, which keeps the portability boundary Stages 0–5 established
 * intact: the analysis modules stay testable without a server, and the only
 * thing that has to be mocked to test a scene is this.
 *
 * TWO TIERS, AND THE REASON. The five analysis artefacts total about 330 KB and
 * carry EVERY headline figure in the product — the panels, the scene text, the
 * header and the whole of the data-quality view need nothing else. The ten
 * processed artefacts total about 14.6 MB and are needed only when a map layer
 * actually draws them. So Tier 1 blocks startup and Tier 2 never does.
 *
 * A FAILED TIER 2 LOAD IS NOT A CRASH. The scene still renders; its layer does
 * not, and says why. That is the same discipline the analysis stages used for a
 * dataset that could not be obtained — the absence is reported, not hidden.
 */

import {
  ANALYSIS_ARTEFACTS,
  PROCESSED_ARTEFACTS,
  createIntelligence,
} from './artefacts.js';

/** Where the artefacts are served from. Mirrors the repository layout. */
export const ANALYSIS_BASE = '/data/analysis';
export const PROCESSED_BASE = '/data/processed';

/** @typedef {'idle'|'loading'|'ready'|'failed'} LoadState */

/**
 * Create a loader.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] injected for tests
 * @param {(event:object)=>void} [options.onProgress]
 */
export function createArtefactLoader({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  onProgress = () => {},
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('An artefact loader needs a fetch implementation.');
  }

  /** @type {Map<string, {state: LoadState, value: object|null, error: string|null}>} */
  const cache = new Map();
  /** @type {Map<string, Promise<object>>} */
  const inFlight = new Map();

  const record = (id, state, value = null, error = null) => {
    cache.set(id, { state, value, error });
    onProgress({ id, state, error });
  };

  async function fetchJson(id, url) {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }

  /**
   * Load one artefact, deduplicating concurrent requests for it.
   *
   * Two scenes prefetching the same dataset must not fetch it twice — at 5 MB
   * that is not a rounding error.
   */
  function load(id, url) {
    const cached = cache.get(id);
    if (cached?.state === 'ready') return Promise.resolve(cached.value);
    const existing = inFlight.get(id);
    if (existing) return existing;

    record(id, 'loading');
    const promise = fetchJson(id, url)
      .then((value) => {
        record(id, 'ready', value);
        inFlight.delete(id);
        return value;
      })
      .catch((error) => {
        record(id, 'failed', null, error.message);
        inFlight.delete(id);
        throw error;
      });
    inFlight.set(id, promise);
    return promise;
  }

  return Object.freeze({
    /**
     * Tier 1. Blocks the first scene, and only the first scene.
     *
     * All five in parallel: they are independent and total ~330 KB, so
     * sequencing them would add latency for nothing.
     */
    async loadTier1() {
      const entries = Object.entries(ANALYSIS_ARTEFACTS);
      const parsed = {};
      await Promise.all(
        entries.map(async ([key, file]) => {
          parsed[key] = await load(key, `${ANALYSIS_BASE}/${file}`);
        }),
      );
      return createIntelligence(parsed);
    },

    /** Tier 2, one dataset. Rejects on failure; the caller degrades. */
    loadProcessed(key) {
      const file = PROCESSED_ARTEFACTS[key];
      if (!file) {
        throw new TypeError(
          `Unknown processed artefact "${key}". Known: ${Object.keys(PROCESSED_ARTEFACTS).join(', ')}.`,
        );
      }
      return load(key, `${PROCESSED_BASE}/${file}`);
    },

    /**
     * Warm the cache without awaiting or throwing.
     *
     * Used to fetch the next scene's datasets while the current one is being
     * read. A prefetch that rejects must never surface as an error: the scene
     * that actually needs it will ask again and handle it then.
     */
    prefetch(keys) {
      for (const key of keys ?? []) {
        if (!PROCESSED_ARTEFACTS[key]) continue;
        const state = cache.get(key)?.state;
        if (state === 'ready' || state === 'loading') continue;
        this.loadProcessed(key).catch(() => {});
      }
    },

    /** @returns {LoadState} */
    stateOf(key) {
      return cache.get(key)?.state ?? 'idle';
    },

    errorOf(key) {
      return cache.get(key)?.error ?? null;
    },

    /** Everything already resolved, for a scene deciding what it can draw. */
    ready(key) {
      const entry = cache.get(key);
      return entry?.state === 'ready' ? entry.value : null;
    },

    /**
     * Load state, counted over the datasets that have actually been ASKED FOR.
     *
     * Counting all ten instead was the first version, and it made the header
     * unable to ever say READY: nothing requests the 5 MB road network until
     * scene 13, so a person reading scene 00 saw `LOADING 0/10` over a case
     * that was completely loaded. An indicator that is permanently wrong is
     * worse than no indicator — it is the fake telemetry the identity rules
     * forbid, arrived at by accident.
     *
     * So `total` is what has been requested and `pending` is what is still in
     * the air. `catalogue` keeps the full count for anything that wants it.
     */
    progress() {
      const tier2 = Object.keys(PROCESSED_ARTEFACTS);
      const requested = tier2.filter((key) => cache.has(key));
      const loaded = requested.filter(
        (key) => cache.get(key).state === 'ready',
      ).length;
      const failed = requested.filter(
        (key) => cache.get(key).state === 'failed',
      ).length;
      return Object.freeze({
        loaded,
        failed,
        pending: requested.length - loaded - failed,
        total: requested.length,
        catalogue: tier2.length,
      });
    },
  });
}
