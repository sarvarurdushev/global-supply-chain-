/**
 * The workspace navigation model.
 *
 * One flat, declarative tree. Every entry carries the three things a user needs
 * before clicking — a name that says what it is, a sentence that says why it
 * matters, and an honest note when the answer is "we cannot show you that" —
 * so the navigation itself does the explaining instead of deferring it to a
 * panel the user has to open first.
 *
 * `view` names the workspace view that renders the entry. `status` is the
 * honesty field:
 *
 *   'ready'     real data, works now
 *   'partial'   works, but the data is a labelled proxy or covers less than
 *               the name implies — the view says so in its own words
 *   'gap'       no data exists; the view explains what would be needed and
 *               offers the nearest thing that does exist
 *
 * A 'gap' entry is deliberately still listed. Hiding it would leave the user
 * assuming the app simply forgot, or worse, assuming the absence of railway
 * data means the absence of railways.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/** @typedef {'ready'|'partial'|'gap'} NavStatus */

export const NAV_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'overview',
    title: 'Global Overview',
    blurb: 'Start here. The world as a single system of moving goods.',
    items: Object.freeze([
      Object.freeze({
        id: 'home',
        name: 'Global Supply Chain',
        icon: '◉',
        summary: 'How the world moves goods, on one screen.',
        view: 'home',
        status: 'ready',
      }),
      Object.freeze({
        id: 'live-transport',
        name: 'Live Transport',
        icon: '⟳',
        summary: 'Everything moving right now — ships, aircraft, satellites.',
        view: 'transport',
        status: 'ready',
      }),
      Object.freeze({
        id: 'trade-routes',
        name: 'Trade Routes',
        icon: '↔',
        summary: 'Who ships what to whom, drawn between real ports.',
        view: 'routes',
        status: 'ready',
      }),
      Object.freeze({
        id: 'chokepoints',
        name: 'Strategic Chokepoints',
        icon: '◈',
        summary: 'The nine passages most of world shipping squeezes through.',
        view: 'chokepoints',
        status: 'ready',
      }),
      Object.freeze({
        id: 'events',
        name: 'Global Events',
        icon: '⚠',
        summary: 'Hazards happening now, and the infrastructure near them.',
        view: 'events',
        status: 'partial',
        note: 'Natural hazards only. Strikes, closures and conflict are not in any open feed.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'analyze',
    title: 'Analyze',
    blurb: 'Pick one thing and follow it through the system.',
    items: Object.freeze([
      Object.freeze({
        id: 'commodity',
        name: 'Product Supply Chain',
        icon: '▣',
        summary: 'Trace one product from producers to consumers.',
        view: 'commodity',
        status: 'ready',
      }),
      Object.freeze({
        id: 'country',
        name: 'Country',
        icon: '⬡',
        summary: 'What one country buys, sells and depends on.',
        view: 'country',
        status: 'ready',
      }),
      Object.freeze({
        id: 'resource',
        name: 'Resource',
        icon: '⛏',
        summary: 'Where a raw material comes from and who needs it.',
        view: 'resource',
        status: 'partial',
        note: 'Ranked by export value, which is a proxy for production, not a measurement of it.',
      }),
      Object.freeze({
        id: 'route',
        name: 'Trade Route',
        icon: '⤳',
        summary: 'One shipping path, port by port.',
        view: 'route',
        status: 'ready',
      }),
      Object.freeze({
        id: 'disruption',
        name: 'Disruption',
        icon: '✕',
        summary: 'Close something and see what has to move instead.',
        view: 'disruption',
        status: 'ready',
      }),
      Object.freeze({
        id: 'risk',
        name: 'Environmental Risk',
        icon: '◍',
        summary: 'Water, drought and flood exposure, and how it reaches trade.',
        view: 'risk',
        status: 'partial',
        note: 'National averages. Water stress is a river-basin property, and basin data is a bulk download rather than an API.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'track',
    title: 'Track',
    blurb: 'Follow a single vehicle or site.',
    items: Object.freeze([
      Object.freeze({
        id: 'ships',
        name: 'Ships',
        icon: '🚢',
        summary: 'Live vessels. Click one to follow it.',
        view: 'track',
        layerId: 'ais-live-vessels',
        status: 'ready',
      }),
      Object.freeze({
        id: 'aircraft',
        name: 'Aircraft',
        icon: '✈',
        summary: 'Live aircraft. Click one to follow it.',
        view: 'track',
        layerId: 'flights',
        status: 'ready',
      }),
      Object.freeze({
        id: 'satellites',
        name: 'Satellites',
        icon: '🛰',
        summary: 'Orbital objects overhead.',
        view: 'track',
        layerId: 'satellites',
        status: 'ready',
      }),
      Object.freeze({
        id: 'trains',
        name: 'Trains',
        icon: '🚆',
        summary: 'City transit vehicles where a feed is published.',
        view: 'track',
        layerId: 'transit',
        status: 'partial',
        note: 'Urban transit, not freight rail. No open global freight-rail feed exists.',
      }),
      Object.freeze({
        id: 'hubs',
        name: 'Major Logistics Hubs',
        icon: '⚓',
        summary: '417 ports, with depth, harbour size and what is near them.',
        view: 'track',
        layerId: 'supply-ports',
        status: 'ready',
      }),
    ]),
  }),
  Object.freeze({
    id: 'layers',
    title: 'Map Layers',
    blurb: 'Turn things on and off on the globe.',
    items: Object.freeze([
      Object.freeze({
        id: 'layer-browser',
        name: 'All Layers',
        icon: '▤',
        summary: 'Every layer, grouped, with what each one actually contains.',
        view: 'layers',
        status: 'ready',
      }),
    ]),
  }),
  Object.freeze({
    id: 'investigations',
    title: 'Investigations',
    blurb: 'Guided sequences that follow one question end to end.',
    items: Object.freeze([
      Object.freeze({
        id: 'inv-hormuz',
        name: 'If Hormuz Closed',
        icon: '◈',
        summary:
          'The world’s busiest oil chokepoint, shut. What reroutes, and how far.',
        view: 'investigation',
        investigationId: 'hormuz-closure',
        status: 'ready',
      }),
      Object.freeze({
        id: 'inv-semiconductors',
        name: 'Where Semiconductors Come From',
        icon: '▣',
        summary:
          'From world trade down to the strait that carries it — and the country that reports nothing.',
        view: 'investigation',
        investigationId: 'semiconductor-dependency',
        status: 'ready',
      }),
      Object.freeze({
        id: 'inv-nepal',
        name: 'Nepal Flood — Corridor Cut',
        icon: '⚠',
        summary:
          'One flood, followed through to the border crossing it closed and the goods that use it.',
        view: 'investigation',
        investigationId: 'nepal-corridor',
        status: 'partial',
        note: 'The flood and the corridor are documented. Tonnage through the crossing is not published.',
      }),
      Object.freeze({
        id: 'inv-fertilizer',
        name: 'Fertilizer — Food’s Supply Chain',
        icon: '🌾',
        summary:
          'Who makes fertilizer, who cannot grow food without it, and what sits in between.',
        view: 'investigation',
        investigationId: 'fertilizer-dependency',
        status: 'ready',
      }),
    ]),
  }),
]);

/** Every nav item, flattened, in presentation order. */
export const NAV_ITEMS = Object.freeze(
  NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) =>
      Object.freeze({ ...item, sectionId: section.id, section: section.title }),
    ),
  ),
);

/** Find a nav item by id. */
export function navItem(id) {
  return NAV_ITEMS.find((item) => item.id === id) ?? null;
}

/** The default landing item. */
export const DEFAULT_NAV_ID = 'home';

/**
 * Suggested next steps from wherever the user is.
 *
 * Requirement: a user should never reach the end of a view and have to invent
 * the next question themselves. Each entry is phrased as the question it
 * answers, because that is how someone actually thinks at that moment — not
 * "Chokepoints" but "what would interrupt this?".
 */
export const NEXT_STEPS = Object.freeze({
  home: Object.freeze([
    { id: 'commodity', question: 'Where does one product come from?' },
    { id: 'chokepoints', question: 'What could interrupt all of this?' },
    { id: 'events', question: 'Is anything happening right now?' },
  ]),
  commodity: Object.freeze([
    { id: 'disruption', question: 'What happens if a route closes?' },
    { id: 'country', question: 'Who depends on this most?' },
    { id: 'resource', question: 'Where is it actually produced?' },
  ]),
  country: Object.freeze([
    { id: 'commodity', question: 'Trace one of its imports' },
    { id: 'chokepoints', question: 'Which passages does its trade use?' },
  ]),
  chokepoints: Object.freeze([
    { id: 'disruption', question: 'Close one and see what reroutes' },
    { id: 'inv-hormuz', question: 'Run the Hormuz investigation' },
  ]),
  disruption: Object.freeze([
    { id: 'country', question: 'Who is exposed to this?' },
    { id: 'events', question: 'Is a real hazard near it now?' },
  ]),
  events: Object.freeze([
    { id: 'chokepoints', question: 'Is any chokepoint exposed?' },
    { id: 'inv-nepal', question: 'See a worked example of one event' },
  ]),
  resource: Object.freeze([
    { id: 'commodity', question: 'See the trade flows for it' },
    { id: 'risk', question: 'Could the climate interrupt it?' },
    { id: 'inv-fertilizer', question: 'Follow fertilizer end to end' },
  ]),
  risk: Object.freeze([
    { id: 'events', question: 'Is a hazard happening there now?' },
    { id: 'commodity', question: 'What does it export?' },
  ]),
  routes: Object.freeze([
    { id: 'chokepoints', question: 'Which passages do these cross?' },
    { id: 'disruption', question: 'Close one and compare' },
  ]),
  transport: Object.freeze([
    { id: 'hubs', question: 'Where are they heading?' },
    { id: 'events', question: 'Is anything disrupting them?' },
  ]),
  layers: Object.freeze([
    { id: 'home', question: 'Back to the whole picture' },
    { id: 'commodity', question: 'Put some trade data on the map' },
  ]),
  track: Object.freeze([
    { id: 'hubs', question: 'Which ports are near it?' },
    { id: 'chokepoints', question: 'Which passages will it cross?' },
  ]),
  route: Object.freeze([
    { id: 'disruption', question: 'Close a passage on this route' },
    { id: 'chokepoints', question: 'What does it pass through?' },
  ]),
  country: Object.freeze([
    { id: 'commodity', question: 'Trace one of its imports' },
    { id: 'chokepoints', question: 'Which passages does its trade use?' },
  ]),
});

/**
 * Resolve the suggested next steps for a view into full nav items.
 *
 * Several nav items share a renderer — Ships, Aircraft and Major Logistics Hubs
 * are all the `track` view — so suggestions are keyed by view and then filtered
 * against where the user actually is. Without `currentItemId`, the Hubs page
 * offered "which ports are near it?" and pointed back at Hubs.
 *
 * @param {string} viewOrItemId the view whose suggestions to look up
 * @param {string} [currentItemId] the nav item in view, excluded from results
 * @returns {Array<{question:string, item:object}>}
 */
export function nextSteps(viewOrItemId, currentItemId = null) {
  const suggestions = NEXT_STEPS[viewOrItemId] ?? [];
  return suggestions
    .map((suggestion) => ({
      question: suggestion.question,
      item: navItem(suggestion.id),
    }))
    .filter((entry) => entry.item !== null && entry.item.id !== currentItemId);
}
