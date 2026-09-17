/**
 * USGS earthquake adapter.
 *
 * The data spine for earthquake investigations, and the reason the Nepal demo
 * can be real rather than illustrative. Everything below was verified against
 * the live service for the 2015 Gorkha M7.8 (`us20002926`) before it was
 * written, and every figure the platform shows can be traced back to a product
 * URL this module returns.
 *
 * WHAT IT DELIVERS, and which section of the brief each piece answers:
 *
 *   event + aftershocks      §21 earthquake: epicentre, magnitude, depth
 *   ShakeMap MMI contours    §21 intensity, §18 the shape of the affected area
 *   PAGER population bands   §6 "do not simply display 10,000 people affected"
 *   PAGER per-city MMI       §3 LEVEL 3, the city-level reading
 *   PAGER alert levels        §9 economic damage, as a published alert
 *   finite-fault rupture     §21 which fault moved and over what length
 *   ground-failure alerts    §11 why the roads failed, in mountains
 *
 * MEASURED, NOT ASSUMED. The 2015 Gorkha PAGER gives population exposed per
 * MMI band as 10,720,626 at IV, 84,253,151 at V, 40,899,271 at VI, 3,556,392 at
 * VII, 2,884,736 at VIII and 11,711 at IX, with a red fatality alert and a red
 * economic alert. Per-city shaking: Kathmandu MMI 7.89, Patan 7.71, Kirtipur
 * 7.68, Bhaktapur 7.54. Those are the numbers the views render.
 *
 * WHAT THIS MODULE REFUSES TO DO. PAGER publishes an alert LEVEL (green,
 * yellow, orange, red) and a probability distribution, not a point estimate of
 * deaths. This adapter returns the level and the published range; it never
 * reduces a distribution to one number, because "an estimated 9,000 deaths"
 * carries a precision USGS does not claim. Actual recorded tolls come from a
 * different kind of source and are labelled as such.
 *
 * Portable: no Cesium, no Node, no browser globals. The transport is injected.
 */

import { DataClass, createProvenance } from '../../supplychain/provenance.js';

/** The FDSN event service. Keyless, no rate limit published for this volume. */
export const FDSN_ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/** PAGER alert levels, in the agency's own words. */
export const PAGER_ALERTS = Object.freeze({
  green: Object.freeze({
    level: 'green',
    fatality: 'No fatalities likely',
    economic: 'No significant damage likely',
    range: '0',
    severity: 0,
  }),
  yellow: Object.freeze({
    level: 'yellow',
    fatality: '1–99 fatalities estimated',
    economic: 'Under $100 million',
    range: '1–99',
    severity: 1,
  }),
  orange: Object.freeze({
    level: 'orange',
    fatality: '100–999 fatalities estimated',
    economic: '$100 million – $1 billion',
    range: '100–999',
    severity: 2,
  }),
  red: Object.freeze({
    level: 'red',
    fatality: '1,000 or more fatalities estimated',
    economic: '$1 billion or more',
    range: '1,000+',
    severity: 3,
  }),
});

/**
 * What a PAGER alert colour actually means, spelled out.
 *
 * Rendered next to the colour everywhere it appears, because a red dot with no
 * caption is a mood rather than a finding.
 */
export function pagerAlert(level) {
  return PAGER_ALERTS[String(level ?? '').toLowerCase()] ?? null;
}

/** MMI band labels, for the population-exposure table. */
const MMI_LABELS = Object.freeze([
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X+',
]);

/**
 * Create the adapter.
 *
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl]
 * @returns {object}
 */
export function createUsgsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function getJson(url, { signal } = {}) {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`USGS HTTP ${response.status}`);
    return response.json();
  }

  async function getText(url, { signal } = {}) {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`USGS HTTP ${response.status}`);
    return response.text();
  }

  return {
    /**
     * One event with all its products.
     *
     * @param {string} eventId e.g. "us20002926"
     */
    async getEvent(eventId, options = {}) {
      if (!/^[a-z0-9]{4,32}$/i.test(String(eventId ?? ''))) {
        throw new TypeError('A USGS event id is required');
      }
      const url = `${FDSN_ENDPOINT}?eventid=${encodeURIComponent(eventId)}&format=geojson`;
      const payload = await getJson(url, options);
      return readEvent(payload, url);
    },

    /**
     * Search the catalogue.
     *
     * Used by the event explorer to offer real recent earthquakes alongside
     * the curated historical cases.
     */
    async search(
      {
        startTime,
        endTime,
        minMagnitude = 6,
        limit = 40,
        latitude = null,
        longitude = null,
        maxRadiusKm = null,
      } = {},
      options = {},
    ) {
      const params = new URLSearchParams({
        format: 'geojson',
        minmagnitude: String(minMagnitude),
        limit: String(Math.max(1, Math.min(200, Math.floor(limit)))),
        orderby: 'magnitude',
      });
      if (startTime) params.set('starttime', startTime);
      if (endTime) params.set('endtime', endTime);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        params.set('latitude', String(latitude));
        params.set('longitude', String(longitude));
        if (Number.isFinite(maxRadiusKm)) {
          params.set('maxradiuskm', String(maxRadiusKm));
        }
      }
      const url = `${FDSN_ENDPOINT}?${params}`;
      const payload = await getJson(url, options);
      return {
        events: (payload?.features ?? []).map(readSummary).filter(Boolean),
        sourceUrl: url,
      };
    },

    /**
     * The aftershock sequence around a mainshock.
     *
     * §21 asks for aftershocks, and they are what makes an earthquake a
     * WEEKS-long event rather than a 60-second one: they collapse structures
     * the mainshock only weakened, and they stop rescue teams entering
     * buildings. So the window is the first 30 days, and the result carries
     * each shock's time for the timeline to filter on.
     */
    async getAftershocks(
      {
        latitude,
        longitude,
        startTime,
        days = 30,
        radiusKm = 250,
        minMagnitude = 4,
      },
      options = {},
    ) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new TypeError('Aftershock search needs a mainshock position');
      }
      const start = new Date(startTime);
      if (Number.isNaN(start.getTime())) {
        throw new TypeError('Aftershock search needs a mainshock time');
      }
      const end = new Date(start.getTime() + days * 86_400_000);
      const params = new URLSearchParams({
        format: 'geojson',
        latitude: String(latitude),
        longitude: String(longitude),
        maxradiuskm: String(radiusKm),
        starttime: new Date(start.getTime() + 60_000).toISOString(),
        endtime: end.toISOString(),
        minmagnitude: String(minMagnitude),
        orderby: 'time-asc',
        limit: '500',
      });
      const url = `${FDSN_ENDPOINT}?${params}`;
      const payload = await getJson(url, options);
      return {
        aftershocks: (payload?.features ?? []).map(readSummary).filter(Boolean),
        sourceUrl: url,
        window: { days, radiusKm, minMagnitude },
      };
    },

    /**
     * ShakeMap MMI contours, as drawable GeoJSON.
     *
     * The measured shape of the affected area — 11 nested MultiLineString
     * bands from MMI 3 up. This is what LEVEL 1 draws over the country to
     * answer "how far did damaging shaking reach".
     */
    async getIntensityContours(event, options = {}) {
      const url = productFile(event, 'shakemap', 'download/cont_mmi.json');
      if (!url) return null;
      const payload = await getJson(url, options);
      const bands = (payload?.features ?? [])
        .map((feature) => {
          const value = Number(feature?.properties?.value);
          if (!Number.isFinite(value)) return null;
          const lines = readMultiLine(feature.geometry);
          if (lines.length === 0) return null;
          return Object.freeze({ mmi: value, lines: Object.freeze(lines) });
        })
        .filter(Boolean)
        .sort((a, b) => a.mmi - b.mmi);
      return Object.freeze({ bands: Object.freeze(bands), sourceUrl: url });
    },

    /**
     * The fault rupture plane.
     *
     * 552 polygons of slip for Gorkha. Answers "which fault moved" — and at
     * LEVEL 2 it explains the shape of the damage, because the rupture ran
     * east from the epicentre under Kathmandu rather than radiating evenly.
     */
    async getRupture(event, options = {}) {
      const url = productFile(event, 'finite-fault', 'FFM.geojson');
      if (!url) return null;
      const payload = await getJson(url, options);
      const patches = (payload?.features ?? [])
        .map((feature) => {
          const ring = readPolygonRing(feature.geometry);
          if (!ring) return null;
          const slip = Number(
            feature?.properties?.slip ?? feature?.properties?.['slip-m'],
          );
          return Object.freeze({
            ring: Object.freeze(ring),
            slipM: Number.isFinite(slip) ? slip : null,
          });
        })
        .filter(Boolean);
      return Object.freeze({ patches: Object.freeze(patches), sourceUrl: url });
    },

    /**
     * PAGER: population exposed per MMI band, plus the alert levels.
     *
     * This is the §6 requirement's data. The XML is parsed with a regex rather
     * than DOMParser so the module stays portable and testable without a
     * browser; the shape is fixed and published, and a parse that finds no
     * bins returns null rather than an empty table that would read as zero
     * exposure.
     */
    async getExposure(event, options = {}) {
      const url = productFile(event, 'losspager', 'pager.xml');
      if (!url) return null;
      const xml = await getText(url, options);
      return readPagerXml(xml, url, event);
    },

    /** Per-city shaking intensity, from the PAGER exposure product. */
    async getCityIntensities(event, options = {}) {
      const url = productFile(event, 'losspager', 'exposure.xml');
      if (!url) return null;
      const xml = await getText(url, options);
      return readCityExposureXml(xml, url);
    },

    /**
     * Ground-failure alerts: landslide and liquefaction.
     *
     * The answer to §11's "why was this road destroyed?" in a mountain
     * country. Gorkha's landslide alert was red with an aggregate hazard of
     * 1,500 km², which is why the corridors closed.
     */
    getGroundFailure(event) {
      const product = event?.products?.['ground-failure'];
      if (!product) return null;
      const p = product.properties ?? {};
      const num = (key) => {
        const value = Number(p[key]);
        return Number.isFinite(value) ? value : null;
      };
      return Object.freeze({
        landslide: Object.freeze({
          alert: p['landslide-alert'] ?? null,
          hazardAlert: p['landslide-hazard-alert-color'] ?? null,
          hazardValue: num('landslide-hazard-alert-value'),
          hazardParameter: p['landslide-hazard-alert-parameter'] ?? null,
          populationAlert: p['landslide-population-alert-color'] ?? null,
          populationValue: num('landslide-population-alert-value'),
        }),
        liquefaction: Object.freeze({
          alert: p['liquefaction-alert'] ?? null,
          hazardAlert: p['liquefaction-hazard-alert-color'] ?? null,
          hazardValue: num('liquefaction-hazard-alert-value'),
          populationAlert: p['liquefaction-population-alert-color'] ?? null,
          populationValue: num('liquefaction-population-alert-value'),
        }),
        /** The published model images, for the evidence panel. */
        images: Object.freeze(
          ['jessee_2017.png', 'godt_2008.png']
            .map((name) => product.contents?.[name]?.url ?? null)
            .filter(Boolean),
        ),
        sourceUrl: product.url ?? null,
      });
    },

    /**
     * The published visual products, for the evidence panel (§12).
     *
     * Images USGS renders itself — the intensity map, the fatality and
     * economic probability histograms, the exposure map, the event poster.
     * Shown as-is with a caption and a link, never redrawn, because redrawing
     * an agency's chart from its own underlying numbers is how a caveat gets
     * lost.
     */
    getVisualProducts(event) {
      const out = [];
      const add = (product, file, title, explains) => {
        const url = event?.products?.[product]?.contents?.[file]?.url;
        if (url)
          out.push(
            Object.freeze({
              id: `${product}:${file}`,
              url,
              title,
              explains,
              source: 'USGS',
            }),
          );
      };
      add(
        'shakemap',
        'download/intensity.jpg',
        'ShakeMap intensity',
        'The measured shaking field, as USGS publishes it.',
      );
      add(
        'losspager',
        'alertfatal.png',
        'Fatality probability',
        'The full distribution PAGER estimates — not a single number.',
      );
      add(
        'losspager',
        'alertecon.png',
        'Economic loss probability',
        'Estimated losses as a distribution, against national GDP.',
      );
      add(
        'losspager',
        'exposure.png',
        'Population exposure map',
        'Where the exposed population actually is.',
      );
      add(
        'losspager',
        'deathsbystruct.png',
        'Deaths by structure type',
        'Which building types the estimate expects to fail.',
      );
      add(
        'ground-failure',
        'jessee_2017.png',
        'Landslide hazard model',
        'Why the mountain roads closed.',
      );
      add(
        'poster',
        'poster.pdf',
        'Event poster',
        'The single-sheet summary USGS issues.',
      );
      add(
        'dyfi',
        'us20002926_ciim.jpg',
        'Felt-report map',
        'Where people reported feeling it.',
      );
      return Object.freeze(out);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Decoding — pure, exported for tests
 * ------------------------------------------------------------------ */

/** The URL of one file inside one product, or null. */
export function productFile(event, productName, fileName) {
  return event?.products?.[productName]?.contents?.[fileName]?.url ?? null;
}

/** Read a MultiLineString or LineString into an array of [lon,lat] arrays. */
function readMultiLine(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') {
    return Array.isArray(geometry.coordinates) ? [geometry.coordinates] : [];
  }
  if (geometry.type === 'MultiLineString') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }
  return [];
}

/** Read the outer ring of a Polygon. */
function readPolygonRing(geometry) {
  if (geometry?.type !== 'Polygon') return null;
  const ring = geometry.coordinates?.[0];
  return Array.isArray(ring) && ring.length >= 3 ? ring : null;
}

/**
 * Decode an FDSN detail response into an event with its products.
 *
 * @param {object} payload
 * @param {string} sourceUrl
 */
export function readEvent(payload, sourceUrl) {
  const props = payload?.properties;
  const coords = payload?.geometry?.coordinates;
  if (!props || !Array.isArray(coords)) return null;
  const products = {};
  for (const [name, list] of Object.entries(props.products ?? {})) {
    const first = Array.isArray(list) ? list[0] : null;
    if (!first) continue;
    products[name] = Object.freeze({
      properties: Object.freeze({ ...(first.properties ?? {}) }),
      contents: Object.freeze({ ...(first.contents ?? {}) }),
      url: first.contents?.['contents.xml']?.url ?? null,
      updated: first.updateTime ?? null,
    });
  }
  return Object.freeze({
    id: payload.id ?? props.code ?? null,
    hazardId: 'earthquake',
    magnitude: Number.isFinite(props.mag) ? props.mag : null,
    magnitudeType: props.magType ?? null,
    place: props.place ?? null,
    time: Number.isFinite(props.time)
      ? new Date(props.time).toISOString()
      : null,
    longitude: coords[0],
    latitude: coords[1],
    depthKm: Number.isFinite(coords[2]) ? coords[2] : null,
    tsunamiFlag: props.tsunami === 1,
    /** USGS's own alert colour for the whole event, which is PAGER's. */
    alert: props.alert ?? null,
    felt: Number.isFinite(props.felt) ? props.felt : null,
    products: Object.freeze(products),
    detailUrl: props.url ?? null,
    sourceUrl,
  });
}

/** Decode one catalogue feature into a summary. */
export function readSummary(feature) {
  const props = feature?.properties;
  const coords = feature?.geometry?.coordinates;
  if (!props || !Array.isArray(coords)) return null;
  return Object.freeze({
    id: feature.id ?? null,
    magnitude: Number.isFinite(props.mag) ? props.mag : null,
    place: props.place ?? null,
    time: Number.isFinite(props.time)
      ? new Date(props.time).toISOString()
      : null,
    timeMs: Number.isFinite(props.time) ? props.time : null,
    longitude: coords[0],
    latitude: coords[1],
    depthKm: Number.isFinite(coords[2]) ? coords[2] : null,
    alert: props.alert ?? null,
    tsunamiFlag: props.tsunami === 1,
    detailUrl: props.url ?? null,
  });
}

/**
 * Decode PAGER's XML into exposure bands and alert levels.
 *
 * The bands are the §6 payload: population by MMI, which turns "people
 * affected" into a distribution across shaking severity. `rangeInsideMap`
 * marks the bands the ShakeMap actually covers — outside it the figure is an
 * extrapolation, and the difference is carried through rather than flattened.
 *
 * @param {string} xml
 * @param {string} sourceUrl
 * @param {object} [event]
 */
export function readPagerXml(xml, sourceUrl, event = null) {
  if (typeof xml !== 'string' || xml.length === 0) return null;

  const bands = [];
  const exposureRe =
    /<exposure\s+dmin="([\d.]+)"\s+dmax="([\d.]+)"\s+exposure="(\d+)"\s+rangeInsideMap="(\d)"/g;
  for (const match of xml.matchAll(exposureRe)) {
    const dmin = Number(match[1]);
    const dmax = Number(match[2]);
    const population = Number(match[3]);
    const mmi = Math.round((dmin + dmax) / 2);
    bands.push(
      Object.freeze({
        mmi,
        label: MMI_LABELS[mmi - 1] ?? String(mmi),
        range: `${dmin}–${dmax}`,
        population,
        /*
         * False means the ShakeMap footprint did not cover this band, so the
         * population figure is extrapolated. Carried rather than dropped: at
         * MMI IV and V for Gorkha these are the tens of millions, and a reader
         * comparing 84 million at V with 2.8 million at VIII is entitled to
         * know the first is a wider and looser estimate.
         */
        insideShakeMap: match[4] === '1',
      }),
    );
  }
  if (bands.length === 0) return null;

  const alerts = {};
  for (const match of xml.matchAll(/<alert\s+type="(\w+)"\s+level="(\w+)"/g)) {
    alerts[match[1]] = match[2];
  }

  const comment = xml.match(/<structcomment[^>]*>([\s\S]*?)<\/structcomment>/);

  const totalInside = bands
    .filter((band) => band.insideShakeMap)
    .reduce((sum, band) => sum + band.population, 0);
  const severe = bands
    .filter((band) => band.mmi >= 7)
    .reduce((sum, band) => sum + band.population, 0);

  return Object.freeze({
    bands: Object.freeze(bands),
    fatalityAlert: pagerAlert(alerts.fatality),
    economicAlert: pagerAlert(alerts.economic),
    /** Population inside the measured ShakeMap footprint. */
    totalInsideShakeMap: totalInside,
    /** Population at MMI VII or above — where damage begins in earnest. */
    populationAtDamagingIntensity: severe,
    /** USGS's own sentence about how vulnerable the local building stock is. */
    vulnerabilityComment: comment
      ? comment[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : null,
    sourceUrl,
    provenance: createProvenance({
      dataClass: DataClass.INFERRED,
      source: 'USGS PAGER',
      dataset: `population exposure and loss alerts for ${event?.id ?? 'this event'}`,
      license: 'Public domain (US Geological Survey)',
      method:
        'PAGER combines the ShakeMap intensity field with LandScan population ' +
        'and country-specific building-vulnerability and fatality functions.',
      retrievedAt: new Date().toISOString(),
      updateFrequency:
        'revised for hours to weeks after an event as data improves',
      confidence: 0.6,
      limitations: [
        'AN ALERT LEVEL, NOT A DEATH TOLL. PAGER publishes a probability ' +
          'distribution and a colour band. This platform shows the band and ' +
          'the published range, and never reduces it to a single number.',
        'EXPOSURE IS NOT CASUALTIES. Population at an intensity is who felt ' +
          'it, not who was hurt. What turns one into the other is building ' +
          'type, time of day and construction quality.',
        'Bands marked outside the ShakeMap footprint are extrapolated and are ' +
          'looser than those inside it.',
        'Population comes from a gridded model, not a census taken on the day.',
      ],
    }),
  });
}

/**
 * Decode per-city shaking from PAGER's exposure product.
 *
 * This is what makes LEVEL 3 real: Kathmandu at MMI 7.89 and Bhaktapur at 7.54
 * are measured values for named places, not a regional average.
 */
export function readCityExposureXml(xml, sourceUrl) {
  if (typeof xml !== 'string') return null;
  const cities = [];
  /*
   * One <feature> block per place, each containing a <point> and a <measure>.
   * Matched as a block rather than by separate scans so a city can never be
   * paired with the next city's intensity.
   */
  const featureRe = /<feature\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/feature>/g;
  for (const match of xml.matchAll(featureRe)) {
    const name = match[1];
    const body = match[2];
    const measure = body.match(/<measure\s+type="MMI"\s+value="([\d.]+)"/);
    if (!measure) continue;
    const mmi = Number(measure[1]);
    if (!Number.isFinite(mmi)) continue;
    /*
     * `<georss:point>` carries "lat lon" in that order — GeoRSS convention,
     * the opposite of GeoJSON's. Reading it the GeoJSON way put Kathmandu in
     * the Indian Ocean, so the order is asserted in the tests.
     */
    const pos = body.match(
      /<georss:point>\s*([-\d.]+)\s+([-\d.]+)\s*<\/georss:point>/,
    );
    /*
     * The same product carries each city's population, which is what turns
     * "Kathmandu shook at MMI 7.89" into "1.44 million people were in a city
     * that shook at MMI 7.89" — the §6 requirement at city resolution.
     */
    const pop = body.match(/<measure\s+type="population"\s+value="(\d+)"/);
    /*
     * An explicit zero is a placeholder, not a measurement. Bhaktapur appears
     * in this product with `value="0"` and has roughly eighty thousand
     * residents: a place listed as EXPOSED cannot have no inhabitants, so a
     * zero here means the source carried no figure. Reported as null so the
     * panel says "not recorded" rather than printing a population of nobody.
     */
    const population = pop ? Number(pop[1]) : null;
    cities.push(
      Object.freeze({
        name,
        mmi,
        latitude: pos ? Number(pos[1]) : null,
        longitude: pos ? Number(pos[2]) : null,
        population: population && population > 0 ? population : null,
      }),
    );
  }
  if (cities.length === 0) return null;
  return Object.freeze({
    cities: Object.freeze(cities.sort((a, b) => b.mmi - a.mmi)),
    sourceUrl,
  });
}
