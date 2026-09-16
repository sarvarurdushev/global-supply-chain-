/**
 * Investigations — guided sequences that follow one question end to end.
 *
 * THE PROBLEM THIS SOLVES: the inherited scenes are cinematic shots. A flood in
 * Nepal, then aircraft, then satellites, then a thermal view. Each is handsome
 * and none of them tells the viewer why they are looking at it, how it connects
 * to the last one, or what it proved.
 *
 * An investigation is the opposite shape. It starts from a question, and every
 * step is a claim with evidence attached and a stated limit. The event is never
 * the analysis — it is step one of an analysis that ends at the countries who
 * would feel it.
 *
 * The structure each investigation follows:
 *
 *    1  QUESTION     what are we actually asking
 *    2  SITUATION    what exists normally
 *    3  MECHANISM    what breaks, or what the dependency is
 *    4  EXPOSURE     who and what is affected
 *    5  ALTERNATIVE  what happens instead
 *    6  LIMIT        what this cannot tell you
 *
 * Every step declares `dataClass`, so a simulated consequence can never be read
 * as an observed one, and `evidence`, so a claim can be checked rather than
 * taken on trust. Steps whose answer is "we don't know" say so in `unknown`
 * rather than being dropped — the gap is part of the finding.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/**
 * @typedef {object} InvestigationStep
 * @property {string} id
 * @property {string} title            what this step shows
 * @property {string} claim            the one-sentence finding
 * @property {string} [detail]         supporting explanation
 * @property {string} dataClass        LIVE | HISTORICAL | INFERRED | SIMULATED | UNKNOWN
 * @property {string} [evidence]       where the claim comes from
 * @property {string} [unknown]        what this step cannot establish
 * @property {object} [camera]         {lat, lon, altKm}
 * @property {object} [layers]         layerId -> boolean
 * @property {object} [action]         a console call this step needs
 * @property {number} holdSec          how long the step reads for
 */

/** Seconds a step holds when it does not say. Long enough to read a claim. */
export const DEFAULT_STEP_HOLD_SEC = 7;

export const INVESTIGATIONS = Object.freeze([
  /* ---------------------------------------------------------------- *
   * Hormuz
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'hormuz-closure',
    name: 'If Hormuz Closed',
    question: 'What happens if the Strait of Hormuz is disrupted?',
    why: 'It is the narrowest point on the route out of the Persian Gulf, and there is very little way around it.',
    estimateSec: 45,
    steps: Object.freeze([
      Object.freeze({
        id: 'hormuz-where',
        title: 'Where it is',
        claim:
          'The Strait of Hormuz is the only sea exit from the Persian Gulf, about 33 km wide at its narrowest.',
        detail:
          'Every cargo leaving Gulf ports by sea passes through it. There is no second maritime door.',
        dataClass: 'HISTORICAL',
        evidence: 'Chokepoint geometry, curated from cited public sources.',
        camera: { lat: 26.57, lon: 56.25, altKm: 900 },
        layers: { chokepoints: true, 'supply-ports': true },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'hormuz-what-passes',
        title: 'What passes through it',
        claim:
          'Crude oil, refined petroleum products and LNG, from Gulf producers to buyers across Asia and Europe.',
        detail:
          'The chokepoint record names the commodities. Per-voyage cargo is a different thing and is not available — see the limit at the end.',
        dataClass: 'HISTORICAL',
        evidence:
          'UN Comtrade crude petroleum (HS 2709) exports by Gulf reporters.',
        action: {
          kind: 'trade',
          commodity: 'crude-oil',
          reporter: 'SAU',
          flow: 'X',
        },
        camera: { lat: 26.0, lon: 54.0, altKm: 2600 },
        layers: { chokepoints: true, 'trade-flows': true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'hormuz-close',
        title: 'Close it',
        claim:
          'With Hormuz removed from the network, the shortest path out of the Gulf has to be recomputed.',
        detail:
          'This is a graph operation on real port and chokepoint geography, not a forecast of anyone’s behaviour.',
        dataClass: 'SIMULATED',
        evidence:
          'Dijkstra over the port/chokepoint graph with the node removed.',
        action: { kind: 'disruption', target: 'hormuz' },
        camera: { lat: 26.57, lon: 56.25, altKm: 1800 },
        layers: { chokepoints: true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'hormuz-alternative',
        title: 'What moves instead',
        claim:
          'The model reroutes onto the next shortest geographic path and reports the extra distance and modelled days.',
        detail:
          'Overland pipelines across Saudi Arabia and the UAE exist and bypass the strait, but their throughput is commercial data and is not in this model.',
        dataClass: 'SIMULATED',
        unknown:
          'Whether a carrier would actually sail the alternative, and whether pipeline capacity could absorb the difference. Both need commercial data.',
        camera: { lat: 20.0, lon: 60.0, altKm: 6000 },
        layers: { chokepoints: true, 'supply-ports': true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'hormuz-exposed',
        title: 'Who is exposed',
        claim:
          'Exposure follows import concentration: the countries buying the most Gulf crude have the most to reroute.',
        dataClass: 'HISTORICAL',
        evidence: 'Import shares from UN Comtrade, by reporter.',
        camera: { lat: 25.0, lon: 90.0, altKm: 12000 },
        layers: { 'trade-flows': true, chokepoints: true },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'hormuz-limit',
        title: 'What this cannot tell you',
        claim:
          'This is topology and distance. It is not a price forecast, a shortage estimate, or a claim about any specific ship.',
        detail:
          'Turning a reroute into an economic consequence needs elasticities and input-output models this project does not have. The honest output stops at "how much further, on what path".',
        dataClass: 'UNKNOWN',
        unknown:
          'Economic impact, cargo aboard individual vessels, and carrier intent.',
        camera: { lat: 26.57, lon: 56.25, altKm: 4000 },
        holdSec: 8,
      }),
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Semiconductors
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'semiconductor-dependency',
    name: 'Where Semiconductors Come From',
    question:
      'Who supplies integrated circuits, and what would interrupt them?',
    why: 'Almost nothing manufactured today works without them, and the supply is unusually concentrated.',
    estimateSec: 50,
    steps: Object.freeze([
      Object.freeze({
        id: 'semi-world',
        title: 'The whole picture',
        claim:
          'Integrated circuits (HS 8542) move between a small number of places, in very large amounts.',
        dataClass: 'HISTORICAL',
        evidence: 'UN Comtrade 2023, all reporting partners.',
        action: {
          kind: 'trade',
          commodity: 'semiconductors',
          reporter: 'KOR',
          flow: 'M',
        },
        camera: { lat: 18.0, lon: 80.0, altKm: 24000 },
        layers: { 'trade-flows': true },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'semi-concentration',
        title: 'How concentrated it is',
        claim:
          'For South Korea in 2023, four partners account for about 80% of imports — roughly 3.5 effective suppliers.',
        detail:
          'HHI 0.287. Above 0.25 is conventionally "highly concentrated". The formula is shown next to the number.',
        dataClass: 'HISTORICAL',
        evidence: 'HHI and CR4 computed from the same Comtrade rows on screen.',
        camera: { lat: 36.5, lon: 127.8, altKm: 5200 },
        layers: { 'trade-flows': true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'semi-taiwan',
        title: 'The largest supplier is a gap',
        claim:
          'The biggest single source is "Other Asia, nes" — an aggregate customs code, not a country.',
        detail:
          'Taiwan does not report to UN Comtrade. Querying it directly returns nothing. Reading that code as Taiwan is an inference, and this app labels it as one instead of quietly relabelling the bar.',
        dataClass: 'INFERRED',
        evidence:
          'Comtrade area code 490. The inference is shown with its evidence, never as a verified figure.',
        unknown:
          'Taiwan’s own reported trade. It exists only in what its partners say about it.',
        camera: { lat: 24.5, lon: 119.5, altKm: 1400 },
        layers: { 'trade-flows': true, chokepoints: true },
        holdSec: 10,
      }),
      Object.freeze({
        id: 'semi-route',
        title: 'How it physically travels',
        claim:
          'High-value chips fly, but the materials, substrates and equipment behind them move by sea through Malacca and the South China Sea.',
        dataClass: 'HISTORICAL',
        evidence: 'Chokepoint geometry and port positions.',
        unknown:
          'The modal split between air and sea for this commodity. No open dataset breaks Comtrade value down by transport mode at this granularity.',
        camera: { lat: 2.5, lon: 101.0, altKm: 1400 },
        layers: { chokepoints: true, 'supply-ports': true },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'semi-disrupt',
        title: 'Interrupt it',
        claim:
          'Closing the Taiwan Strait forces traffic around, and the model reports how much further.',
        dataClass: 'SIMULATED',
        action: { kind: 'disruption', target: 'taiwan-strait' },
        camera: { lat: 24.5, lon: 119.5, altKm: 2600 },
        layers: { chokepoints: true },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'semi-limit',
        title: 'What this cannot tell you',
        claim:
          'Trade data sees finished chips crossing borders. It does not see the fabs, the tooling, or who could substitute for whom.',
        detail:
          'Fab-level capacity is company-confidential. The supply chain behind a chip — wafers, photoresist, lithography machines — is only partly visible in customs codes.',
        dataClass: 'UNKNOWN',
        unknown: 'Facility capacity, lead times, and substitutability.',
        holdSec: 8,
      }),
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Nepal — the event reframed as the START of an analysis
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'nepal-corridor',
    name: 'Nepal Flood — Corridor Cut',
    question:
      'A flood closed a mountain road. What does that road carry, and who notices?',
    why: 'It is the clearest small example of the whole method: an event is only interesting once you follow it to the goods.',
    estimateSec: 55,
    steps: Object.freeze([
      Object.freeze({
        id: 'nepal-event',
        title: 'The event',
        claim:
          'In 2026 a flood surge on the Bhote Koshi destroyed sections of the valley road and the border infrastructure at Timure.',
        detail:
          'This is the starting point of the analysis, not the analysis. A flood on its own tells you nothing about trade.',
        dataClass: 'HISTORICAL',
        evidence:
          'Documented incident with cited imagery and an evidence pack in the inherited scene.',
        camera: { lat: 28.05, lon: 85.22, altKm: 130 },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'nepal-infrastructure',
        title: 'What it hit',
        claim:
          'The damage sits on the road to the Rasuwagadhi/Gyirong crossing — one of only two significant road links between Nepal and China.',
        dataClass: 'HISTORICAL',
        evidence:
          'Incident geography, cross-referenced to the crossing location.',
        camera: { lat: 28.27, lon: 85.38, altKm: 60 },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'nepal-corridor',
        title: 'What the corridor carries',
        claim:
          'Nepal’s imports from China are dominated by manufactured goods, electronics and machinery.',
        detail:
          'Customs data gives the commodity mix at the country level. It does not say which crossing each consignment used.',
        dataClass: 'HISTORICAL',
        evidence: 'UN Comtrade: Nepal as reporter, China as partner.',
        action: {
          kind: 'trade',
          commodity: 'machinery',
          reporter: 'NPL',
          flow: 'M',
        },
        camera: { lat: 28.4, lon: 84.5, altKm: 1200 },
        layers: { 'trade-flows': true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'nepal-tonnage',
        title: 'How much goes through this crossing',
        claim: 'Unknown. This is a real gap, not an oversight.',
        detail:
          'Per-crossing tonnage is not published by either customs authority in any open form. Anyone who gives you a number for this crossing is estimating, and should say so.',
        dataClass: 'UNKNOWN',
        unknown:
          'Volume through Rasuwagadhi specifically, and the share of Nepal-China trade it represents.',
        holdSec: 9,
      }),
      Object.freeze({
        id: 'nepal-alternative',
        title: 'What moves instead',
        claim:
          'Traffic shifts to the Tatopani/Zhangmu crossing, or onto the far longer route through India.',
        dataClass: 'INFERRED',
        evidence:
          'Geographic alternatives from the road network. Which one absorbs the traffic depends on capacity nobody publishes.',
        unknown: 'Whether either alternative has the capacity.',
        camera: { lat: 27.9, lon: 85.5, altKm: 900 },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'nepal-lesson',
        title: 'Why this generalises',
        claim:
          'A landlocked country with two road links to a neighbour is one flood away from a single point of failure.',
        detail:
          'The same method applies at any scale — the Gulf has one sea exit, and Nepal has two roads. What changes is the size of the number, not the shape of the problem.',
        dataClass: 'INFERRED',
        holdSec: 9,
      }),
    ]),
  }),

  /* ---------------------------------------------------------------- *
   * Fertilizer
   * ---------------------------------------------------------------- */
  Object.freeze({
    id: 'fertilizer-dependency',
    name: 'Fertilizer — Food’s Supply Chain',
    question:
      'Who makes fertilizer, and which countries cannot farm without it?',
    why: 'Fertilizer is the least visible input to the food supply and one of the most concentrated.',
    estimateSec: 45,
    steps: Object.freeze([
      Object.freeze({
        id: 'fert-inputs',
        title: 'What it is made from',
        claim:
          'Three separate supply chains: nitrogen from natural gas, phosphate from rock, potash from mined salts.',
        detail:
          'They are usually discussed as one commodity and they are not one commodity. A gas price shock hits nitrogen and leaves potash alone.',
        dataClass: 'HISTORICAL',
        evidence: 'HS chapter 31 splits along these lines.',
        camera: { lat: 30.0, lon: 20.0, altKm: 20000 },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'fert-producers',
        title: 'Who exports it',
        claim:
          'Export value is concentrated in a handful of countries with either cheap gas or large mineral deposits.',
        dataClass: 'INFERRED',
        evidence:
          'Export value by reporter, used as a proxy for production. Re-export hubs are flagged individually.',
        unknown:
          'Actual production tonnage. Exports omit everything a country grows and consumes at home, which for fertilizer is substantial.',
        action: { kind: 'production', commodity: 'fertilizer-potash' },
        camera: { lat: 40.0, lon: 40.0, altKm: 14000 },
        layers: { 'trade-flows': true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'fert-importers',
        title: 'Who cannot farm without it',
        claim:
          'Import dependency is highest where soils are poor, farms are small, and there is no domestic production.',
        dataClass: 'HISTORICAL',
        evidence: 'Import shares by reporter from UN Comtrade.',
        action: {
          kind: 'trade',
          commodity: 'fertilizer-potash',
          reporter: 'BRA',
          flow: 'M',
        },
        camera: { lat: -10.0, lon: -50.0, altKm: 9000 },
        layers: { 'trade-flows': true },
        holdSec: 9,
      }),
      Object.freeze({
        id: 'fert-route',
        title: 'How it travels',
        claim:
          'Bulk carriers, through the same chokepoints as everything else — and fertilizer is low-value per tonne, so a longer route hurts it more.',
        dataClass: 'INFERRED',
        detail:
          'A reroute that adds 30% to the voyage is absorbable on electronics and painful on bulk minerals. This app reports the distance; the sensitivity is yours to weigh.',
        camera: { lat: 15.0, lon: 50.0, altKm: 7000 },
        layers: { chokepoints: true, 'supply-ports': true },
        holdSec: 8,
      }),
      Object.freeze({
        id: 'fert-limit',
        title: 'What this cannot tell you',
        claim:
          'Trade data stops at the border. It does not reach the farm, the planting season, or the yield.',
        dataClass: 'UNKNOWN',
        unknown:
          'Application rates, soil requirements, stock levels, and the lag between a shortfall and a harvest.',
        holdSec: 8,
      }),
    ]),
  }),
]);

/** Look up an investigation by id. */
export function investigation(id) {
  return INVESTIGATIONS.find((entry) => entry.id === id) ?? null;
}

/** Total run time of an investigation, in seconds. */
export function investigationDurationSec(entry) {
  if (!entry?.steps) return 0;
  return entry.steps.reduce(
    (total, step) => total + (step.holdSec || DEFAULT_STEP_HOLD_SEC),
    0,
  );
}

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */

/**
 * A step-based playback controller.
 *
 * Deliberately NOT a timeline scrubber. An investigation is a sequence of
 * claims, and the unit a user wants to move by is "one claim", not "2.5
 * seconds". So the controller advances by step and auto-advance is a
 * convenience on top, which is also what makes pause and step-back behave the
 * way people expect.
 *
 * The user can stop at any moment — requirement, and the failure mode of the
 * inherited director, which plays a scene to the end once started.
 *
 * Timers are injected so this is testable without a browser and without
 * waiting in real time.
 *
 * @param {object} input
 * @param {object} input.investigation
 * @param {(step:object, index:number)=>void|Promise<void>} input.onStep
 * @param {(state:object)=>void} [input.onChange]
 * @param {(fn:Function, ms:number)=>*} [input.setTimer]
 * @param {(handle:*)=>void} [input.clearTimer]
 */
export function createPlayback({
  investigation: entry,
  onStep,
  onChange = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  if (!entry?.steps?.length) {
    throw new TypeError('createPlayback requires an investigation with steps');
  }
  if (typeof onStep !== 'function') {
    throw new TypeError('createPlayback requires an onStep callback');
  }

  const total = entry.steps.length;
  let index = -1;
  let status = 'idle'; // idle | playing | paused | finished
  let timer = null;

  function publish() {
    onChange(state());
  }

  function state() {
    return Object.freeze({
      investigationId: entry.id,
      status,
      index,
      total,
      step: index >= 0 ? entry.steps[index] : null,
      // 0 before the first step, 1 when the last has been shown. Drives the
      // progress bar, which is the only way a user knows how much is left.
      progress: index < 0 ? 0 : (index + 1) / total,
      canPrevious: index > 0,
      canNext: index < total - 1,
    });
  }

  function cancelTimer() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  async function show(nextIndex) {
    index = Math.max(0, Math.min(total - 1, nextIndex));
    const step = entry.steps[index];
    publish();
    // A step's side effects (camera, layers, data) are the host's business.
    // Failures there must not strand playback, so they are reported and the
    // sequence continues — a half-loaded step is still readable.
    try {
      await onStep(step, index);
    } catch (error) {
      onChange(
        Object.freeze({
          ...state(),
          stepError: error?.message ?? String(error),
        }),
      );
    }
  }

  function scheduleAdvance() {
    cancelTimer();
    if (status !== 'playing') return;
    const step = entry.steps[index];
    const holdMs = (step?.holdSec || DEFAULT_STEP_HOLD_SEC) * 1000;
    timer = setTimer(() => {
      timer = null;
      if (status !== 'playing') return;
      if (index >= total - 1) {
        status = 'finished';
        publish();
        return;
      }
      void show(index + 1).then(scheduleAdvance);
    }, holdMs);
  }

  return {
    /** Start, or resume from a pause. */
    async play() {
      if (status === 'playing') return state();
      status = 'playing';
      if (index < 0 || status === 'finished') {
        await show(0);
      } else {
        publish();
      }
      scheduleAdvance();
      return state();
    },

    /** Hold on the current step. Nothing is torn down. */
    pause() {
      if (status !== 'playing') return state();
      cancelTimer();
      status = 'paused';
      publish();
      return state();
    },

    /** Stop and return to the beginning without showing anything. */
    stop() {
      cancelTimer();
      status = 'idle';
      index = -1;
      publish();
      return state();
    },

    /** Stop and play again from step one. */
    async restart() {
      cancelTimer();
      status = 'playing';
      index = -1;
      await show(0);
      scheduleAdvance();
      return state();
    },

    /**
     * Step forward by hand.
     *
     * Stepping always pauses: a user who reached for the button wants to look
     * at this step, not be carried off it two seconds later.
     */
    async next() {
      cancelTimer();
      if (index >= total - 1) {
        status = 'finished';
        publish();
        return state();
      }
      status = 'paused';
      await show(index + 1);
      return state();
    },

    /** Step back by hand. Also pauses. */
    async previous() {
      cancelTimer();
      if (index <= 0) return state();
      status = 'paused';
      await show(index - 1);
      return state();
    },

    /** Jump straight to a step, for a progress-bar click or a deep link. */
    async goTo(target) {
      cancelTimer();
      status = 'paused';
      await show(target);
      return state();
    },

    /** Current state, for a host that re-renders from scratch. */
    getState: state,

    /** Release the timer. Safe to call twice. */
    destroy() {
      cancelTimer();
      status = 'idle';
    },
  };
}
