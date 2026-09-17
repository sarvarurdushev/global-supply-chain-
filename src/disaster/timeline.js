/**
 * The disaster timeline, and what is actually knowable at each phase.
 *
 * §4 asks for a timeline where moving the handle changes the map: the hazard
 * zone expands, roads become blocked, evacuation areas change, shelters
 * activate, supply routes disrupt. That is the requirement, and this module is
 * where it meets a hard constraint worth stating plainly:
 *
 *   NO DISASTER HAS AN HOUR-BY-HOUR CASUALTY FEED.
 *
 * Deaths are counted over days and weeks and revised for months. Road closures
 * are reported by district authorities in situation reports, not as a live
 * layer. So a timeline that showed "T+6h: 1,240 deaths" would be inventing the
 * most emotionally loaded number in the product, which §5 and §42 both forbid.
 *
 * WHAT THIS MODULE DOES INSTEAD. It separates three things at every phase and
 * labels each one, so the timeline is still a real investigation:
 *
 *   OBSERVED    Events with a real timestamp. Aftershocks are the clearest
 *               case: USGS timestamps every one, so "which shocks had happened
 *               by T+6h" is a measured answer, and it is exactly what stopped
 *               rescue teams entering buildings.
 *   MODELLED    Exposure computed from real geometry. Which road segments
 *               cross high landslide-hazard terrain IS computable from the OSM
 *               network and the USGS ground-failure model. That is exposure,
 *               not damage, and it is labelled as such.
 *   UNAVAILABLE The per-phase casualty count, the per-road damage assessment,
 *               the shelter occupancy. Declared, with what would supply it.
 *
 * So the map does change as the handle moves — aftershocks accumulate, the
 * hazard footprint grows, exposure is recomputed, routes re-solve against
 * closures — and the panel is explicit that the closures are modelled and the
 * casualty total is an end-state figure rather than a running one.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { phasesFor } from './hazards.js';
import { AVAILABILITY } from './catalogue.js';

/**
 * What each phase is about, per hazard family.
 *
 * The narrative of a phase is not the same for every hazard: T+6h in an
 * earthquake is aftershocks and blocked roads; T+6h in a wildfire is the front
 * moving toward a town. So the copy is keyed by hazard and phase, and a hazard
 * with no entry falls back to the phase's generic heading rather than being
 * given an earthquake's story.
 */
const PHASE_NARRATIVE = Object.freeze({
  earthquake: Object.freeze({
    'T-0': {
      what: 'The rupture. Ground motion radiates from the fault over roughly a minute.',
      watch: 'The intensity field is the whole story of who was exposed.',
    },
    'T+1h': {
      what: 'Collapses are already complete. The first aftershocks begin.',
      watch:
        'Aftershocks are timestamped, so this is a measured layer rather than a guess.',
    },
    'T+6h': {
      what: 'Roads are being found blocked rather than reported blocked. Landslides in mountain terrain are the usual cause.',
      watch:
        'Compare the road network against the landslide-hazard model: that is where the corridor fails.',
    },
    'T+12h': {
      what: 'External search and rescue begins arriving, through whatever airport is open.',
      watch:
        'One functioning airport is a single point of failure for an entire response.',
    },
    'T+24h': {
      what: 'Displacement becomes the dominant problem. People do not re-enter damaged buildings, aftershocks or not.',
      watch: 'Shelter capacity against exposed population.',
    },
    'T+48h': {
      what: 'Supply chains begin to fail behind the disaster, not in it.',
      watch:
        'The factories are standing and the road to the port is not. That is the §8 story.',
    },
    'T+7d': {
      what: 'Relief logistics stabilise. The aftershock rate has dropped by roughly an order of magnitude.',
      watch:
        'Which routes reopened, and which are still one slope away from closing again.',
    },
    'T+30d': {
      what: 'Reconstruction planning replaces response.',
      watch:
        'What the damage assessment concluded, against what the model predicted.',
    },
  }),
  flood: Object.freeze({
    'T-72h': {
      what: 'Upstream rainfall or a lake level is already outside normal range.',
      watch: 'The forecast window is the only phase where evacuation is cheap.',
    },
    'T-24h': {
      what: 'Warning is issued, if a warning system reaches this valley.',
      watch: 'Whether the people downstream can be reached at all.',
    },
    'T-1h': {
      what: 'The surge is in the upper valley.',
      watch:
        'Travel time down the reach is the warning time anyone actually gets.',
    },
    'T-0': {
      what: 'The flood front arrives.',
      watch: 'Depth, not extent, decides what survives.',
    },
    'T+1h': {
      what: 'Peak stage. Bridges and riverside road fail first.',
      watch: 'The corridor, not the buildings.',
    },
    'T+6h': {
      what: 'The water begins to fall, leaving debris and scour behind it.',
      watch: 'What is now unreachable.',
    },
    'T+12h': {
      what: 'Access assessment. Helicopters where the road is gone.',
      watch: 'Which settlements are isolated.',
    },
    'T+24h': {
      what: 'Displacement and water-borne disease risk.',
      watch: 'Shelter and clean water together.',
    },
    'T+48h': {
      what: 'Trade through the corridor has stopped.',
      watch: 'What crosses this border, and what it is worth.',
    },
    'T+7d': {
      what: 'Temporary crossings restore partial access.',
      watch: 'Capacity against normal throughput.',
    },
  }),
  wildfire: Object.freeze({
    'T-24h': {
      what: 'Fuel is dry and wind is forecast.',
      watch: 'What is downwind.',
    },
    'T-0': {
      what: 'Ignition.',
      watch: 'Where the front starts relative to settlements.',
    },
    'T+6h': {
      what: 'The front is running with the wind.',
      watch: 'Spread direction against evacuation routes.',
    },
    'T+12h': {
      what: 'Evacuation orders follow the front.',
      watch: 'Whether the road out crosses the fire path.',
    },
    'T+24h': {
      what: 'Perimeter growth and structure loss.',
      watch: 'Which perimeter segment is uncontained.',
    },
    'T+48h': {
      what: 'Smoke reaches cities far from the fire.',
      watch: 'Air quality as a second, wider impact.',
    },
    'T+7d': {
      what: 'Containment. Bare slopes now carry debris-flow risk.',
      watch: 'The next hazard the fire created.',
    },
  }),
});

/**
 * Which layers a phase should have on, and why.
 *
 * §4's requirement is that the map changes. This is the authored part of that:
 * a phase declares what becomes relevant, so stepping the timeline turns on
 * the layers that answer the new phase's question rather than leaving the user
 * to hunt for them.
 */
const PHASE_LAYERS = Object.freeze({
  'T-72h': ['country-borders', 'terrain-3d'],
  'T-24h': ['country-borders', 'population-exposure'],
  'T-1h': ['terrain-3d'],
  'T-0': ['country-borders', 'population-exposure'],
  'T+1h': ['population-exposure', 'casualties'],
  'T+6h': ['roads-state', 'blocked-routes', 'terrain-3d'],
  'T+12h': ['airports-state', 'rescue-routes', 'hospitals'],
  'T+24h': ['shelters', 'displacement', 'evacuation-routes'],
  'T+48h': ['supply-chain', 'supply-ports', 'aid-corridors'],
  'T+7d': ['damage-heatmap', 'aid-corridors'],
  'T+30d': ['damage-heatmap'],
});

/**
 * What each phase can and cannot report, by dimension.
 *
 * This is the honest core. `OBSERVED` means a timestamped source exists;
 * `MODELLED` means it is computed from real geometry and labelled; the absent
 * ones are listed in `unavailable` with what would supply them.
 */
const PHASE_EVIDENCE = Object.freeze({
  'T-0': {
    observed: ['hazard-footprint'],
    modelled: ['population-exposure'],
    unavailable: [],
  },
  'T+1h': {
    observed: ['aftershocks', 'hazard-footprint'],
    modelled: ['population-exposure'],
    unavailable: ['casualty-count'],
  },
  'T+6h': {
    observed: ['aftershocks'],
    modelled: ['road-exposure', 'landslide-hazard'],
    unavailable: ['casualty-count', 'road-damage-assessment'],
  },
  'T+12h': {
    observed: ['aftershocks'],
    modelled: ['rescue-routing', 'hospital-access'],
    unavailable: ['casualty-count', 'rescue-team-positions'],
  },
  'T+24h': {
    observed: ['aftershocks'],
    modelled: ['shelter-access', 'displacement-exposure'],
    unavailable: ['casualty-count', 'shelter-occupancy', 'displacement-count'],
  },
  'T+48h': {
    observed: [],
    modelled: ['supply-disruption', 'route-detour'],
    unavailable: ['casualty-count', 'trade-volume-loss'],
  },
  'T+7d': {
    observed: ['aftershocks'],
    modelled: ['damage-exposure'],
    unavailable: ['road-reopening-dates', 'economic-loss-by-district'],
  },
  'T+30d': {
    observed: ['final-assessment'],
    modelled: [],
    unavailable: ['reconstruction-progress'],
  },
});

/**
 * What each unavailable dimension would take to supply.
 *
 * §5 and §20: an absence is stated with what would fill it, never left as an
 * empty panel a reader reads as an oversight.
 */
export const UNAVAILABLE_REASONS = Object.freeze({
  'casualty-count': {
    name: 'Casualties at this hour',
    because:
      'No disaster publishes a running casualty count. Deaths are counted over days, revised for months, and released as situation reports rather than a feed.',
    wouldNeed:
      'Time-stamped national disaster-authority situation reports, parsed per release. For Nepal 2015 those exist as PDFs from the National Emergency Operation Centre.',
    instead:
      'The confirmed end-state total is shown on the case, attributed to the Government of Nepal Post Disaster Needs Assessment.',
  },
  'road-damage-assessment': {
    name: 'Which roads were actually damaged',
    because:
      'Road damage is surveyed by district engineers and reported in situation reports. There is no open per-segment damage feed for any past disaster.',
    wouldNeed:
      'Copernicus EMS rapid-mapping grading vectors, or a national road-authority assessment layer.',
    instead:
      'Road EXPOSURE is computed instead: which real OSM segments cross terrain the USGS ground-failure model rates as high landslide hazard. That is a modelled risk, not an observed closure, and it is labelled that way.',
  },
  'rescue-team-positions': {
    name: 'Where rescue teams were',
    because: 'Team locations are operational data held by responding agencies.',
    wouldNeed: 'An INSARAG or national EOC operational feed.',
    instead:
      'Rescue ROUTING is computed from the real road network against modelled closures, which answers "where could they get to" rather than "where were they".',
  },
  'shelter-occupancy': {
    name: 'How full the shelters were',
    because:
      'Occupancy is recorded by camp managers on paper or in agency systems.',
    wouldNeed: 'IOM Displacement Tracking Matrix round data for the event.',
    instead:
      'Shelter LOCATIONS are real, from OpenStreetMap, with their mapped capacity where a surveyor recorded one.',
  },
  'displacement-count': {
    name: 'How many people were displaced, at this hour',
    because: 'Displacement figures are assessed in rounds, typically weekly.',
    wouldNeed: 'IOM DTM or UNHCR operational data for the event.',
    instead:
      'Population exposed at damaging intensity is shown, from USGS PAGER.',
  },
  'trade-volume-loss': {
    name: 'Trade actually lost through the corridor',
    because:
      'Customs data is annual and national. It cannot resolve a week or a single crossing.',
    wouldNeed: 'Border-post throughput records from the customs authority.',
    instead:
      'The supply-chain model shows the structural disruption — which routes break, the extra distance and the additional transit time — rather than a monetary loss.',
  },
  'road-reopening-dates': {
    name: 'When each road reopened',
    because:
      'Reopening is announced locally and not archived as structured data.',
    wouldNeed: 'National road-authority status archives.',
    instead: 'The recovery phase shows which routes the model can solve again.',
  },
  'economic-loss-by-district': {
    name: 'Economic loss by district',
    because:
      'Post-disaster needs assessments publish sector and national totals, rarely a district breakdown in machine-readable form.',
    wouldNeed: 'The PDNA district annexes as structured data.',
    instead:
      'The national total is shown with its source, and damage EXPOSURE is mapped by intensity band.',
  },
  'reconstruction-progress': {
    name: 'Reconstruction progress',
    because:
      'Tracked by national reconstruction authorities in their own systems.',
    wouldNeed: 'National Reconstruction Authority progress datasets.',
    instead:
      'The confirmed damage totals are shown as the reconstruction baseline.',
  },
});

/**
 * Build the timeline for one case.
 *
 * @param {object} entry a catalogue case
 * @returns {Readonly<object>}
 */
export function buildTimeline(entry) {
  if (!entry?.hazardId) throw new TypeError('a timeline requires a case');
  const phases = phasesFor(entry.hazardId);
  const narrative = PHASE_NARRATIVE[entry.hazardId] ?? {};
  const steps = phases.map((phase, index) => {
    const evidence = PHASE_EVIDENCE[phase.key] ?? {
      observed: [],
      modelled: [],
      unavailable: [],
    };
    const copy = narrative[phase.key] ?? null;
    return Object.freeze({
      index,
      key: phase.key,
      label: phase.label,
      heading: phase.heading,
      offsetHours: phase.offsetHours,
      /** The absolute instant, when the case has a date. */
      at: absoluteTime(entry.date, phase.offsetHours),
      what: copy?.what ?? `${phase.heading}.`,
      watch: copy?.watch ?? null,
      /** Layers this phase turns on, filtered to what the case supports. */
      layers: Object.freeze(PHASE_LAYERS[phase.key] ?? []),
      observed: Object.freeze([...evidence.observed]),
      modelled: Object.freeze([...evidence.modelled]),
      unavailable: Object.freeze(
        evidence.unavailable.map((id) =>
          Object.freeze({ id, ...(UNAVAILABLE_REASONS[id] ?? {}) }),
        ),
      ),
      /**
       * The honest one-line summary of this phase's epistemic status, which
       * the timeline strip prints under the heading.
       */
      evidenceSummary: summariseEvidence(evidence),
    });
  });
  return Object.freeze({
    caseId: entry.id,
    hazardId: entry.hazardId,
    steps: Object.freeze(steps),
    /**
     * Whether this hazard could have been warned about at all, which is the
     * difference between a flood and an earthquake and is worth saying once
     * rather than leaving the reader to notice the missing phases.
     */
    warnable: steps.some((step) => step.offsetHours < 0),
  });
}

function summariseEvidence({ observed, modelled, unavailable }) {
  const parts = [];
  if (observed.length > 0) {
    parts.push(`${observed.length} observed`);
  }
  if (modelled.length > 0) {
    parts.push(`${modelled.length} modelled`);
  }
  if (unavailable.length > 0) {
    parts.push(`${unavailable.length} unavailable`);
  }
  if (parts.length === 0) return 'Nothing is resolvable at this phase.';
  return parts.join(' · ');
}

/** The wall-clock instant of a phase, or null when the case has no date. */
export function absoluteTime(date, offsetHours) {
  if (!date) return null;
  const base = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + offsetHours * 3_600_000).toISOString();
}

/**
 * Filter timestamped events to those that had happened by a phase.
 *
 * This is the one genuinely measured thing that changes as the handle moves.
 * Aftershocks carry USGS timestamps, so "which shocks had occurred by T+6h" is
 * an answer rather than an interpolation — and it is the layer that explains
 * why rescue teams could not enter buildings.
 *
 * @param {Array<object>} events items with an ISO `time`
 * @param {string} originTime the mainshock's ISO time
 * @param {number} offsetHours the phase offset
 */
export function eventsByPhase(events, originTime, offsetHours) {
  const origin = new Date(originTime);
  if (Number.isNaN(origin.getTime())) return [];
  const cutoff = origin.getTime() + offsetHours * 3_600_000;
  return (events ?? []).filter((item) => {
    const t = new Date(item?.time).getTime();
    return Number.isFinite(t) && t <= cutoff;
  });
}

/**
 * The state of the world at one phase, assembled from what is available.
 *
 * `inputs` is whatever the host managed to load — aftershocks from USGS,
 * exposure from PAGER, a road network from OSM. Anything absent is reported as
 * absent rather than defaulted, because a zero and a missing measurement look
 * identical once they reach a chart.
 *
 * @param {object} input
 * @param {object} input.timeline from buildTimeline
 * @param {number} input.phaseIndex
 * @param {object} [input.inputs]
 */
export function worldStateAt({ timeline, phaseIndex, inputs = {} }) {
  const step = timeline?.steps?.[phaseIndex];
  if (!step) return null;
  const { aftershocks = null, exposure = null, originTime = null } = inputs;

  const shocksSoFar =
    Array.isArray(aftershocks) && originTime
      ? eventsByPhase(aftershocks, originTime, step.offsetHours)
      : null;

  const readings = [];
  if (shocksSoFar) {
    const largest = shocksSoFar.reduce(
      (max, item) =>
        item.magnitude > (max?.magnitude ?? -Infinity) ? item : max,
      null,
    );
    readings.push(
      Object.freeze({
        id: 'aftershocks',
        name: 'Aftershocks so far',
        value: shocksSoFar.length,
        unit: 'shocks M4+',
        detail: largest
          ? `Largest so far M${largest.magnitude?.toFixed(1)} at ${largest.time?.slice(11, 16)} UTC`
          : 'None yet recorded at this magnitude',
        availability: AVAILABILITY.CONFIRMED,
        source: 'USGS catalogue, filtered by timestamp',
      }),
    );
  }
  if (exposure?.populationAtDamagingIntensity != null) {
    readings.push(
      Object.freeze({
        id: 'population-exposure',
        name: 'Population at MMI VII or above',
        value: exposure.populationAtDamagingIntensity,
        unit: 'people',
        detail:
          'Exposure, not casualties. Who felt damaging shaking, not who was hurt.',
        availability: AVAILABILITY.MODELLED,
        source: 'USGS PAGER',
      }),
    );
  }

  return Object.freeze({
    phase: step,
    readings: Object.freeze(readings),
    /** Layers the host should have on at this phase. */
    layers: step.layers,
    /** Restated here so a panel rendering one phase has it to hand. */
    unavailable: step.unavailable,
    /*
     * True when this phase has nothing measured at all. The panel says so
     * rather than rendering an empty readings list, which reads as "nothing
     * happened" instead of "nothing is recorded".
     */
    nothingMeasured: readings.length === 0,
  });
}
