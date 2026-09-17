/**
 * The disaster session — the bridge between a case and the screen.
 *
 * One object owns everything an open investigation needs: the case, the
 * investigation state machine, whatever data has loaded, and the derived
 * impact and response readings. Views read it; they never fetch.
 *
 * WHY THIS EXISTS AS ITS OWN LAYER. §27 requires the stages to feel like one
 * investigation rather than separate pages, and the thing that would break
 * that fastest is each view loading its own data. The timeline view and the
 * human-impact view both need PAGER exposure; fetching it twice would make
 * them disagree the moment one request failed. So loading happens once, here,
 * and every view projects the same snapshot.
 *
 * LOADING IS INCREMENTAL AND PARTIAL FAILURE IS NORMAL. Six upstream products
 * are fetched for an earthquake and any of them can fail independently. A
 * failed product is recorded as failed with its error, and the views that
 * depend on it say so — rather than one failure emptying the whole
 * investigation. `status` per product is the mechanism.
 *
 * THE HAZARD LAYER IS PUSHED, NOT PULLED. As products land, the session
 * converts them into the geometry declarations `layers/hazard` understands and
 * pushes them. That conversion is the only place USGS's shapes meet the
 * renderer's, which is what keeps the renderer hazard-agnostic.
 *
 * Portable except for the layer handle it is given: no Cesium import, no Node,
 * no browser globals beyond the injected fetch.
 */

import { createInvestigation } from './investigation.js';
import { buildTimeline, worldStateAt } from './timeline.js';
import {
  affectedCities,
  economicApportionment,
  humanImpactBands,
} from './impact.js';
import { createUsgsSource } from './sources/usgs.js';
import { AVAILABILITY } from './catalogue.js';
import { GEOMETRY_KIND } from './hazards.js';

/** Per-product load status. */
export const LOAD_STATUS = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  LOADED: 'LOADED',
  FAILED: 'FAILED',
  /** The case has no source for this product at all. */
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/**
 * The products a session tries to load, in the order they are useful.
 *
 * `needs` names what must already be loaded, so the sequence is declared
 * rather than encoded in a chain of awaits.
 */
export const PRODUCTS = Object.freeze([
  Object.freeze({ id: 'event', name: 'Event record', needs: [] }),
  Object.freeze({
    id: 'exposure',
    name: 'Population exposure',
    needs: ['event'],
  }),
  Object.freeze({ id: 'contours', name: 'Intensity field', needs: ['event'] }),
  Object.freeze({ id: 'cities', name: 'City intensities', needs: ['event'] }),
  Object.freeze({
    id: 'aftershocks',
    name: 'Aftershock sequence',
    needs: ['event'],
  }),
  Object.freeze({ id: 'rupture', name: 'Fault rupture', needs: ['event'] }),
  Object.freeze({
    id: 'groundFailure',
    name: 'Ground failure',
    needs: ['event'],
  }),
]);

/**
 * Create a session for one case.
 *
 * @param {object} deps
 * @param {object} deps.case a decorated catalogue case
 * @param {object} [deps.hazardLayer] the layer to push geometry into
 * @param {object} [deps.usgs] injectable source
 * @param {(state:object)=>void} [deps.onChange]
 * @param {(intent:object)=>void} [deps.onIntent]
 */
export function createDisasterSession({
  case: entry,
  hazardLayer = null,
  usgs = createUsgsSource(),
  onChange = () => {},
  onIntent = () => {},
}) {
  if (!entry?.id) throw new TypeError('a session requires a case');

  const timeline = buildTimeline(entry);
  const investigation = createInvestigation({
    case: entry,
    onIntent: (intent) => {
      /*
       * A phase change has to reach the hazard layer as well as the host: the
       * layer filters its own time-varying geometry on the offset, which is
       * what makes stepping the timeline change the SHAPES and not only the
       * numbers.
       */
      if (intent.kind === 'phase' && hazardLayer) {
        hazardLayer.setPhaseOffsetHours?.(intent.offsetHours);
      }
      onIntent(intent);
    },
    onChange: () => notify(),
  });

  /** Loaded products, keyed by id. */
  const data = new Map();
  /** Status per product id. */
  const status = new Map(
    PRODUCTS.map((product) => [product.id, LOAD_STATUS.IDLE]),
  );
  /** Error message per failed product. */
  const errors = new Map();
  let loading = false;

  function notify() {
    onChange(snapshot());
  }

  function setStatus(id, value, error = null) {
    status.set(id, value);
    if (error) errors.set(id, error);
    else errors.delete(id);
  }

  /* ---------------- loading ---------------- */

  /**
   * Load everything this case can supply.
   *
   * Products run in parallel after the event record, because they are
   * independent requests against the same host and serialising them makes an
   * investigation take six round trips to open.
   */
  async function load({ signal } = {}) {
    if (loading) return snapshot();
    loading = true;
    notify();
    try {
      if (!entry.usgsEventId) {
        /*
         * A case with no wired source is not an error. The Bhote Koshi flood
         * has an event pack rather than an agency product, and the views say
         * which dimensions that leaves unavailable.
         */
        for (const product of PRODUCTS) {
          setStatus(product.id, LOAD_STATUS.NOT_APPLICABLE);
        }
        return snapshot();
      }

      setStatus('event', LOAD_STATUS.LOADING);
      notify();
      let event;
      try {
        event = await usgs.getEvent(entry.usgsEventId, { signal });
        if (!event) throw new Error('the event record could not be decoded');
        data.set('event', event);
        setStatus('event', LOAD_STATUS.LOADED);
      } catch (error) {
        setStatus('event', LOAD_STATUS.FAILED, messageOf(error));
        /*
         * Without the event record nothing else can be addressed, so the rest
         * are marked failed with the reason rather than left IDLE — IDLE would
         * read as "not tried yet" and the user would wait for a load that is
         * never coming.
         */
        for (const product of PRODUCTS.slice(1)) {
          setStatus(
            product.id,
            LOAD_STATUS.FAILED,
            'the event record did not load',
          );
        }
        return snapshot();
      }
      notify();

      const jobs = [
        ['exposure', () => usgs.getExposure(event, { signal })],
        ['contours', () => usgs.getIntensityContours(event, { signal })],
        ['cities', () => usgs.getCityIntensities(event, { signal })],
        [
          'aftershocks',
          () =>
            usgs.getAftershocks(
              {
                latitude: event.latitude,
                longitude: event.longitude,
                startTime: event.time,
                days: 30,
                minMagnitude: 4.5,
              },
              { signal },
            ),
        ],
        ['rupture', () => usgs.getRupture(event, { signal })],
        ['groundFailure', async () => usgs.getGroundFailure(event)],
      ];

      for (const [id] of jobs) setStatus(id, LOAD_STATUS.LOADING);
      notify();

      await Promise.all(
        jobs.map(async ([id, run]) => {
          try {
            const result = await run();
            if (result == null) {
              // The product genuinely is not published for this event.
              setStatus(id, LOAD_STATUS.NOT_APPLICABLE);
              return;
            }
            data.set(id, result);
            setStatus(id, LOAD_STATUS.LOADED);
          } catch (error) {
            setStatus(id, LOAD_STATUS.FAILED, messageOf(error));
          }
        }),
      );

      pushGeometry();
      return snapshot();
    } finally {
      loading = false;
      notify();
    }
  }

  /* ---------------- geometry ---------------- */

  /**
   * Convert loaded products into geometry declarations and push them.
   *
   * The only place an agency's data shape meets the renderer's, which is what
   * lets `layers/hazard` stay hazard-agnostic.
   */
  function pushGeometry() {
    if (!hazardLayer?.setGeometry) return 0;
    let pushed = 0;

    const contours = data.get('contours');
    if (contours?.bands?.length) {
      pushed += hazardLayer.setGeometry({
        id: 'mmi-contours',
        name: 'Shaking intensity',
        kind: GEOMETRY_KIND.CONTOUR_BANDS,
        scale: 'MMI',
        answers: 'How far did damaging shaking reach, and how hard?',
        bands: contours.bands.map((band) => ({
          value: band.mmi,
          lines: band.lines,
        })),
      })
        ? 1
        : 0;
    }

    const rupture = data.get('rupture');
    if (rupture?.patches?.length) {
      pushed += hazardLayer.setGeometry({
        id: 'rupture',
        name: 'Fault rupture',
        kind: GEOMETRY_KIND.SOURCE_GEOMETRY,
        answers: 'Which fault moved, and over what length?',
        parts: rupture.patches,
      })
        ? 1
        : 0;
    }

    const aftershocks = data.get('aftershocks');
    const event = data.get('event');
    if (aftershocks?.aftershocks?.length && event?.time) {
      const origin = new Date(event.time).getTime();
      pushed += hazardLayer.setGeometry({
        id: 'aftershocks',
        name: 'Aftershocks',
        kind: GEOMETRY_KIND.POINT_FIELD,
        answers: 'Where is the sequence still active, and for how long?',
        colour: '#ff9100',
        points: aftershocks.aftershocks.map((shock) => ({
          lat: shock.latitude,
          lon: shock.longitude,
          value: shock.magnitude,
          label: `M${shock.magnitude?.toFixed(1)} ${shock.place ?? ''}`.trim(),
          time: shock.time,
          /*
           * The hours-since-onset each shock carries is what the layer filters
           * on, so the point field genuinely accumulates as the handle moves
           * rather than appearing all at once.
           */
          phaseOffsetHours:
            (new Date(shock.time).getTime() - origin) / 3_600_000,
        })),
      })
        ? 1
        : 0;
    }
    return pushed;
  }

  /* ---------------- derived readings ---------------- */

  /** Human impact, derived once from whatever loaded. */
  function human() {
    const exposure = data.get('exposure');
    if (!exposure) return null;
    return humanImpactBands({
      exposure,
      contours: data.get('contours') ?? null,
    });
  }

  function cities({ minMmi = 6 } = {}) {
    const cityIntensities = data.get('cities');
    if (!cityIntensities) return null;
    return affectedCities({ cityIntensities, minMmi });
  }

  function economic() {
    const total = entry.confirmed?.economicLossUsd;
    const bands = human();
    if (!total?.value || !bands) return null;
    return economicApportionment({
      nationalTotalUsd: total.value,
      totalSource: total.source,
      human: bands,
    });
  }

  /** The world at the current phase, from the loaded products. */
  function worldState() {
    const state = investigation.getState();
    return worldStateAt({
      timeline,
      phaseIndex: state.phase.index,
      inputs: {
        aftershocks: data.get('aftershocks')?.aftershocks ?? null,
        exposure: data.get('exposure') ?? null,
        originTime: data.get('event')?.time ?? entry.date ?? null,
      },
    });
  }

  /**
   * The visual products, for the evidence panel.
   *
   * Merges the agency's published images with whatever the case's own event
   * pack carries, so a case with field media and a case with satellite
   * products both fill the same panel.
   */
  function evidence() {
    const event = data.get('event');
    const agency = event ? (usgs.getVisualProducts?.(event) ?? []) : [];
    const groundFailure = data.get('groundFailure');
    const extra = (groundFailure?.images ?? []).map((url, index) => ({
      id: `ground-failure:${index}`,
      url,
      title: 'Ground-failure model',
      explains:
        'The modelled landslide hazard — the answer to why the mountain roads closed.',
      source: 'USGS',
    }));
    return Object.freeze([...agency, ...extra]);
  }

  /* ---------------- snapshot ---------------- */

  function snapshot() {
    const products = PRODUCTS.map((product) =>
      Object.freeze({
        ...product,
        status: status.get(product.id),
        error: errors.get(product.id) ?? null,
        loaded: status.get(product.id) === LOAD_STATUS.LOADED,
      }),
    );
    return Object.freeze({
      caseId: entry.id,
      caseName: entry.name,
      hazardId: entry.hazardId,
      loading,
      products: Object.freeze(products),
      loadedCount: products.filter((product) => product.loaded).length,
      failedCount: products.filter(
        (product) => product.status === LOAD_STATUS.FAILED,
      ).length,
      investigation: investigation.getState(),
      /** True once anything at all is on screen. */
      hasData: data.size > 0,
    });
  }

  return {
    case: entry,
    timeline,
    investigation,
    load,
    /** Raw product access, for a view that needs the source URL. */
    product: (id) => data.get(id) ?? null,
    productStatus: (id) => status.get(id) ?? LOAD_STATUS.IDLE,
    productError: (id) => errors.get(id) ?? null,
    human,
    cities,
    economic,
    worldState,
    evidence,
    pushGeometry,
    getState: snapshot,
    /**
     * The availability label for one dimension, combining what the case
     * claims with what actually loaded. A case that says CONFIRMED but whose
     * product failed must not still read CONFIRMED.
     */
    availabilityFor(dimension) {
      const claimed = entry.dataAvailability?.[dimension];
      if (!claimed) return AVAILABILITY.UNAVAILABLE;
      const required = {
        hazard: ['contours'],
        human: ['exposure'],
        infrastructure: ['groundFailure'],
        economic: ['exposure'],
        evidence: ['event'],
      }[dimension];
      if (!required) return claimed;
      const ok = required.every((id) => status.get(id) === LOAD_STATUS.LOADED);
      return ok ? claimed : AVAILABILITY.UNAVAILABLE;
    },
    destroy() {
      investigation.destroy();
      hazardLayer?.clearGeometry?.();
      data.clear();
      status.clear();
      errors.clear();
    },
  };
}

function messageOf(error) {
  return error?.message ?? String(error);
}
