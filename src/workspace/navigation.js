/**
 * The navigation model.
 *
 * One flat, declarative tree. Every entry carries the three things a user needs
 * before clicking — a name that says what it is, a sentence that says why it
 * matters, and an honest note when the answer is "we cannot show you that" —
 * so the navigation itself does the explaining instead of deferring it to a
 * panel the user has to open first.
 *
 * RESTRUCTURED AROUND THE INVESTIGATION (§22). The sections are the stages of
 * one continuous investigation rather than a menu of features:
 *
 *   EVENTS          which disaster (LEVEL 0)
 *   INVESTIGATE     descend into it, and step its timeline
 *   IMPACT          who and what it reached
 *   CONSEQUENCES    infrastructure, supply chain, economy
 *   RESPONSE        rescue, evacuation, humanitarian logistics
 *   MAP LAYERS      what can be drawn
 *   SOURCES         where every figure came from
 *
 * §17's three questions run across those sections rather than being a section:
 * EVENTS and INVESTIGATE answer WHAT HAPPENED, IMPACT and CONSEQUENCES answer
 * WHY IT MATTERED, RESPONSE answers WHAT NOW. The `question` field on each
 * section names which one it serves, so the interface can say so without the
 * user having to pick a mode.
 *
 * THE SUPPLY-CHAIN VIEWS ARE KEPT, DELIBERATELY. §8: "Do not abandon the
 * supply-chain capabilities from the previous version. Instead, make
 * supply-chain analysis a major consequence of natural disasters." They moved
 * from being the product to being the CONSEQUENCES section, with the same
 * engines behind them.
 *
 * `view` names the view that renders the entry. `status` is the honesty field:
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
    id: 'events',
    title: 'Events',
    blurb: 'Start here. Every disaster the platform can investigate.',
    question: 'what-happened',
    items: Object.freeze([
      Object.freeze({
        id: 'case-explorer',
        name: 'Disaster Explorer',
        icon: '◎',
        summary:
          'Live alerts and documented cases, with what each one can prove.',
        view: 'cases',
        status: 'ready',
      }),
      Object.freeze({
        id: 'guided-demo',
        name: 'Guided Demonstration',
        icon: '▶',
        summary: 'The whole concept in sixteen scenes, on one real earthquake.',
        view: 'demo',
        status: 'ready',
      }),
      Object.freeze({
        id: 'live-hazards',
        name: 'Live Hazards',
        icon: '⚠',
        summary: 'What is happening right now, from the GDACS alert feed.',
        view: 'events',
        status: 'partial',
        note: 'Natural hazards only. No conflict, strikes or closures — an empty map is not evidence that nothing happened.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'investigate',
    title: 'Investigate',
    blurb: 'Descend into one event, and move through its timeline.',
    question: 'what-happened',
    items: Object.freeze([
      Object.freeze({
        id: 'descent',
        name: 'Geographic Descent',
        icon: '⤓',
        summary: 'World to region to country to district to the site itself.',
        view: 'descent',
        status: 'ready',
      }),
      Object.freeze({
        id: 'timeline',
        name: 'Event Timeline',
        icon: '⧗',
        summary: 'T-0 to T+30d, with the map changing as you move.',
        view: 'timeline',
        status: 'partial',
        note: 'Aftershocks are timestamped and genuinely accumulate. Hour-by-hour casualty counts do not exist for any disaster and are declared rather than invented.',
      }),
      Object.freeze({
        id: 'hazard-layers',
        name: 'Hazard Geometry',
        icon: '◈',
        summary:
          'The intensity field, the rupture, the perimeter — per hazard type.',
        view: 'hazard',
        status: 'ready',
      }),
      Object.freeze({
        id: 'evidence',
        name: 'Visual Evidence',
        icon: '▣',
        summary:
          'Satellite, photographs, video and official products, in place.',
        view: 'evidence',
        status: 'partial',
        note: 'Imagery depends on what the agencies published for the event. Some cases have before/after satellite pairs; others have only field media.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'impact',
    title: 'Impact',
    blurb: 'Who and what the event reached, shown geographically.',
    question: 'why-it-mattered',
    items: Object.freeze([
      Object.freeze({
        id: 'human-impact',
        name: 'Human Impact',
        icon: '◍',
        summary: 'Population by shaking intensity, and the cities inside it.',
        view: 'human',
        status: 'partial',
        note: 'Exposure, not casualties. Who experienced the hazard, not who was hurt.',
      }),
      Object.freeze({
        id: 'infrastructure',
        name: 'Infrastructure',
        icon: '⌗',
        summary: 'Roads, bridges, airports and hospitals against the hazard.',
        view: 'infrastructure',
        status: 'partial',
        note: 'Exposure computed from real geometry and a published hazard model. Observed damage assessments are not open data for past disasters.',
      }),
      Object.freeze({
        id: 'economic',
        name: 'Economic Damage',
        icon: '◱',
        summary:
          'A cited national total, distributed across the affected area.',
        view: 'economic',
        status: 'partial',
        note: 'The total is cited; its distribution is this project’s apportionment, labelled as such.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'consequences',
    title: 'Consequences',
    blurb:
      'What the event broke beyond the damage: the system that connects people to goods.',
    question: 'why-it-mattered',
    items: Object.freeze([
      Object.freeze({
        id: 'supply-disruption',
        name: 'Supply-Chain Disruption',
        icon: '⛓',
        summary: 'Which routes the event cut, and what has to travel instead.',
        view: 'disruption',
        status: 'ready',
      }),
      Object.freeze({
        id: 'affected-route',
        name: 'Affected Supply Route',
        icon: '▣',
        summary:
          'One product’s journey, stage by stage, through the affected area.',
        view: 'route',
        status: 'partial',
        note: 'Five of ten stages have no open source and are drawn as gaps.',
      }),
      Object.freeze({
        id: 'event-chokepoints',
        name: 'Strategic Chokepoints',
        icon: '◈',
        summary: 'The narrow places world trade squeezes through.',
        view: 'chokepoints',
        status: 'ready',
      }),
      Object.freeze({
        id: 'product-dependencies',
        name: 'Product Dependencies',
        icon: '◫',
        summary: 'Who supplies the affected region, and who depends on it.',
        view: 'commodity',
        status: 'partial',
        note: 'Annual customs data, one to two years behind. Never live.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'response',
    title: 'Response',
    blurb: 'What can be done, drawn on the map rather than described.',
    question: 'what-now',
    items: Object.freeze([
      Object.freeze({
        id: 'rescue',
        name: 'Rescue Access',
        icon: '✚',
        summary:
          'Which routes reach the affected area, and what the detour costs.',
        view: 'rescue',
        status: 'partial',
        note: 'Routes are solved over the real road network; which segments are impassable is modelled exposure, not a reported closure.',
      }),
      Object.freeze({
        id: 'evacuation',
        name: 'Evacuation Scenarios',
        icon: '⇥',
        summary: 'How the feasible answer changes as roads close.',
        view: 'evacuation',
        status: 'partial',
        note: 'Safe zones are real mapped facilities. Capacity is shown only where a surveyor recorded one.',
      }),
      Object.freeze({
        id: 'humanitarian',
        name: 'Humanitarian Logistics',
        icon: '◈',
        summary:
          'Need to supply to route to destination, solved per demand point.',
        view: 'humanitarian',
        status: 'partial',
        note: 'Tonnage required is not published for any event and is not estimated here.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'overview',
    title: 'Baseline',
    blurb: 'The undisrupted world, for comparison against the event.',
    question: 'why-it-mattered',
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
    id: 'sources',
    title: 'Sources',
    blurb: 'Where every figure came from, and what is not connected yet.',
    question: 'what-happened',
    items: Object.freeze([
      Object.freeze({
        id: 'provenance',
        name: 'Data Provenance',
        icon: '⌘',
        summary: 'Every adapter, what it provides, and whether it is wired.',
        view: 'sources',
        status: 'ready',
      }),
    ]),
  }),
  Object.freeze({
    id: 'investigations',
    title: 'Guided Investigations',
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
  /*
   * The investigation sequence. Unlike the supply-chain views, where the next
   * question depends on what the reader is curious about, these have a real
   * order: you cannot read impact before you know where you are, and response
   * only means something once you know what broke.
   */
  demo: Object.freeze([
    { id: 'case-explorer', question: 'Investigate a case yourself' },
    { id: 'provenance', question: 'Where did all of this come from?' },
  ]),
  cases: Object.freeze([
    { id: 'guided-demo', question: 'Or watch the guided demonstration' },
    { id: 'descent', question: 'Descend into the one you picked' },
    { id: 'live-hazards', question: 'What is happening right now?' },
  ]),
  descent: Object.freeze([
    { id: 'timeline', question: 'Now watch it unfold' },
    { id: 'hazard-layers', question: 'What can be drawn here?' },
  ]),
  timeline: Object.freeze([
    { id: 'human-impact', question: 'Who was inside this?' },
    { id: 'infrastructure', question: 'What stopped working?' },
  ]),
  hazard: Object.freeze([
    { id: 'human-impact', question: 'Who was inside the affected area?' },
    { id: 'evidence', question: 'Show me the imagery' },
  ]),
  human: Object.freeze([
    { id: 'infrastructure', question: 'What did it cut?' },
    { id: 'economic', question: 'What did it cost?' },
  ]),
  infrastructure: Object.freeze([
    { id: 'supply-disruption', question: 'What did that do to supply?' },
    { id: 'rescue', question: 'Can rescuers still get in?' },
  ]),
  economic: Object.freeze([
    { id: 'supply-disruption', question: 'Which routes carried that value?' },
    {
      id: 'product-dependencies',
      question: 'Who else depends on this region?',
    },
  ]),
  rescue: Object.freeze([
    { id: 'evacuation', question: 'Where can people go?' },
    { id: 'humanitarian', question: 'Where do supplies go?' },
  ]),
  evacuation: Object.freeze([
    { id: 'humanitarian', question: 'And how does aid reach them?' },
    { id: 'infrastructure', question: 'Why are those roads closed?' },
  ]),
  humanitarian: Object.freeze([
    { id: 'supply-disruption', question: 'What does this do to normal trade?' },
    { id: 'provenance', question: 'Where did all this come from?' },
  ]),
  evidence: Object.freeze([
    { id: 'provenance', question: 'What else is published for this event?' },
    { id: 'timeline', question: 'Put it back on the timeline' },
  ]),
  sources: Object.freeze([
    { id: 'case-explorer', question: 'Pick another event to investigate' },
  ]),
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
