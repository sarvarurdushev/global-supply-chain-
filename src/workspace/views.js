/**
 * Workspace views.
 *
 * Every view returns the same shape — `{ title, summary, cards }` — and the
 * shell renders it into the one scroll region. That uniformity is the point:
 * the old panel let each section invent its own layout, and the result was
 * five sections that looked like five different applications.
 *
 * Each view follows the same information hierarchy:
 *
 *   LEVEL 1  what am I looking at   → panel title and summary
 *   LEVEL 2  why does it matter     → whyThisMatters(), mandatory
 *   LEVEL 3  what data supports it  → cards, with provenance collapsed inside
 *   LEVEL 4  what next              → nextStepsBlock(), at the bottom
 *
 * A view never fetches. It renders whatever the context already has and asks
 * the context to load what it does not, so a slow network shows a loading card
 * rather than an empty panel.
 */

import {
  h,
  card,
  whyThisMatters,
  dataClassBadge,
  term,
  loadingState,
  errorState,
  emptyState,
  unavailableState,
  metric,
  metricRow,
  button,
  field,
  select,
  nextStepsBlock,
  provenanceBlock,
} from './components.js';
import { LAYER_NAMES, layerName } from './taxonomy.js';
import { nextSteps } from './navigation.js';
import { INVESTIGATIONS, investigationDurationSec } from './investigations.js';
import { CHOKEPOINTS } from '../supplychain/reference/chokepoints.js';
import { MAJOR_PORTS } from '../supplychain/reference/ports.js';
import { COMMODITY_GROUPS } from '../supplychain/reference/commodities.js';
import { COUNTRIES } from '../supplychain/reference/countries.js';
import { interpretArea } from '../supplychain/reference/areas.js';
import {
  buildSupplyChain,
  transportMode,
  STAGE_KINDS,
} from '../supplychain/chain.js';
import { RISK_INDICATORS } from '../supplychain/environment.js';

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const usd = (value) => {
  if (!Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const km = (value) =>
  Number.isFinite(value) ? `${Math.round(value).toLocaleString()} km` : 'n/a';

/** A ranked row with a proportion bar. */
function rankRow({
  label,
  value,
  share,
  note = null,
  inferred = false,
  onClick = null,
}) {
  const children = [
    h('div', { class: 'ws-list-label' }, [
      label,
      note ? h('span', { class: 'ws-list-note', text: note }) : null,
      Number.isFinite(share)
        ? h('div', { class: 'ws-bar' }, [
            h('div', {
              class: `ws-bar-fill${inferred ? ' ws-bar-inferred' : ''}`,
              style: { width: `${Math.max(1, Math.min(100, share * 100))}%` },
            }),
          ])
        : null,
    ]),
    h('span', { class: 'ws-list-value', text: value }),
  ];
  return onClick
    ? h(
        'button',
        { class: 'ws-list-row ws-clickable', type: 'button', onClick },
        children,
      )
    : h('div', { class: 'ws-list-row' }, children);
}

/** A definition list of key/value facts. */
function facts(rows) {
  return h(
    'dl',
    { class: 'ws-kv' },
    rows
      .filter(
        ([, value]) => value !== null && value !== undefined && value !== '',
      )
      .flatMap(([key, value, mono]) => [
        h('dt', { text: key }),
        h('dd', { class: mono ? 'ws-mono' : '', text: String(value) }),
      ]),
  );
}

/* ------------------------------------------------------------------ *
 * 1. Home — Global Supply Chain
 * ------------------------------------------------------------------ */

function homeView(ctx) {
  const liveLayers = ['ais-live-vessels', 'flights', 'satellites'];
  const cards = [];

  cards.push(
    card({
      children: [
        whyThisMatters({
          what: 'This is a system for seeing how the world moves goods.',
          why: 'Almost everything you own crossed at least one ocean, one port and one narrow strait to reach you. This shows those paths, who depends on them, and what happens when one closes.',
        }),
      ],
    }),
  );

  // The spine of the product, stated as a flow rather than a feature list.
  cards.push(
    card({
      title: 'The chain, end to end',
      subtitle: 'Each stage is something you can open and investigate.',
      children: [
        h(
          'ol',
          { class: 'ws-list' },
          [
            [
              'Resources',
              'Where raw materials come out of the ground',
              'resource',
            ],
            ['Production', 'Where they are turned into goods', 'resource'],
            [
              'Transport',
              'Ships, aircraft and trains carrying them',
              'live-transport',
            ],
            [
              'Chokepoints',
              'The narrow places everything squeezes through',
              'chokepoints',
            ],
            [
              'Countries',
              'Who sells, who buys, who depends on whom',
              'country',
            ],
            ['Consumers', 'Where it all ends up', 'commodity'],
          ].map(([name, what, target], index) =>
            h('li', {}, [
              rankRow({
                label: h('span', {}, [
                  h('strong', { text: `${index + 1}. ${name}` }),
                  h('span', { class: 'ws-list-note', text: what }),
                ]),
                value: '→',
                onClick: () => ctx.navigate(target),
              }),
            ]),
          ),
        ),
      ],
    }),
  );

  // What is actually on the globe right now.
  const stats = liveLayers.map((id) => {
    const layer = ctx.layers.get(id);
    const name = layerName(id);
    return {
      id,
      name: name?.name ?? id,
      enabled: ctx.layers.isEnabled(id),
      count: layer?.getStats?.()?.count ?? null,
    };
  });

  cards.push(
    card({
      title: 'On the globe now',
      subtitle: 'Turn a layer on to put it on the map.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          stats.map((stat) =>
            rankRow({
              label: stat.name,
              value: stat.enabled
                ? stat.count === null
                  ? 'loading'
                  : String(stat.count)
                : 'off',
              note: stat.enabled ? null : 'click to enable',
              onClick: () => {
                ctx.layers.setEnabled(stat.id, !stat.enabled);
                ctx.refresh();
              },
            }),
          ),
        ),
        h('p', {}, [
          'Counts are what the feed returned, not a census. ',
          'Coverage varies by region and by receiver.',
        ]),
      ],
    }),
  );

  cards.push(
    card({
      title: 'Fixed infrastructure',
      children: [
        metricRow([
          metric({
            value: String(MAJOR_PORTS.length),
            label: 'major ports',
            hint: 'NGA World Port Index',
          }),
          metric({
            value: String(CHOKEPOINTS.length),
            label: h('span', {}, [term('chokepoint', 'chokepoints')]),
            hint: 'Curated from cited public sources',
          }),
          metric({
            value: String(COUNTRIES.filter((c) => c.m49 !== null).length),
            label: 'reporting countries',
            hint: 'Countries that file trade statistics to UN Comtrade',
          }),
        ]),
      ],
    }),
  );

  cards.push(
    card({
      title: 'Start an investigation',
      subtitle: 'A guided sequence that follows one question to its end.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          INVESTIGATIONS.map((entry) =>
            rankRow({
              label: h('span', {}, [
                h('strong', { text: entry.name }),
                h('span', { class: 'ws-list-note', text: entry.question }),
              ]),
              value: `${Math.round(investigationDurationSec(entry) / 5) * 5}s`,
              onClick: () => ctx.openInvestigation(entry.id),
            }),
          ),
        ),
      ],
    }),
  );

  return {
    title: 'Global Supply Chain',
    summary:
      'The world as one system: what is produced where, how it travels, and what would interrupt it.',
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Live transport
 * ------------------------------------------------------------------ */

function transportView(ctx) {
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Everything here is broadcasting its own position right now.',
          why: 'Ships and aircraft transmit where they are, so this is one of the few parts of a supply chain you can watch live rather than reconstruct afterwards.',
          dataClass: 'LIVE',
        }),
      ],
    }),
  ];

  const groups = new Map();
  for (const entry of LAYER_NAMES.filter((l) => l.group === 'What Moves')) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }

  for (const [group, entries] of groups) {
    cards.push(
      card({
        title: group,
        children: entries.map((entry) => {
          const enabled = ctx.layers.isEnabled(entry.id);
          const stats = ctx.layers.get(entry.id)?.getStats?.() ?? {};
          return h('div', { class: 'ws-card-sub' }, [
            rankRow({
              label: h('span', {}, [
                h('strong', { text: `${entry.icon} ${entry.name}` }),
                h('span', { class: 'ws-list-note', text: entry.summary }),
              ]),
              value: enabled ? (stats.count ?? '…') : 'OFF',
              onClick: () => {
                ctx.layers.setEnabled(entry.id, !enabled);
                ctx.refresh();
              },
            }),
            entry.caveat
              ? h('p', { class: 'ws-field-hint', text: `⚠ ${entry.caveat}` })
              : null,
            enabled && stats.error
              ? errorState({
                  what: entry.name.toLowerCase(),
                  detail: stats.error,
                  onRetry: () => {
                    ctx.layers.setEnabled(entry.id, false);
                    ctx.layers.setEnabled(entry.id, true);
                    ctx.refresh();
                  },
                })
              : null,
          ]);
        }),
      }),
    );
  }

  cards.push(
    card({
      title: 'How to follow one',
      children: [
        h('p', {}, [
          'Click any aircraft or vessel on the globe. It is selected, highlighted and followed immediately — ',
          h('strong', { text: 'one click, not a menu' }),
          '. Use ',
          h('strong', { text: 'Stop Following' }),
          ' in the top bar to release it.',
        ]),
      ],
    }),
  );

  return {
    title: 'Live Transport',
    summary: 'What is moving right now, from the vehicles’ own broadcasts.',
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 3. Strategic chokepoints
 * ------------------------------------------------------------------ */

function chokepointsView(ctx) {
  const selected = ctx.state.chokepointId
    ? CHOKEPOINTS.find((c) => c.id === ctx.state.chokepointId)
    : null;

  if (selected) return chokepointDetail(ctx, selected);

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'These are the narrow places a very large share of world trade has to pass through.',
          why: 'A chokepoint matters because of what happens when it is unavailable: the alternative is always longer, and sometimes there is no alternative at all.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
    card({
      title: 'All chokepoints',
      subtitle:
        'Click one to see what it carries and what closing it would do.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          CHOKEPOINTS.map((point) =>
            rankRow({
              label: h('span', {}, [
                h('strong', { text: point.name }),
                h('span', {
                  class: 'ws-list-note',
                  text: point.connects.join(' ↔ '),
                }),
              ]),
              value: point.detourVia ? 'has detour' : 'NO ALTERNATIVE',
              onClick: () => {
                ctx.state.chokepointId = point.id;
                ctx.globe.flyTo({
                  lat: point.lat,
                  lon: point.lon,
                  altKm: 1400,
                });
                ctx.layers.setEnabled('chokepoints', true);
                ctx.refresh();
              },
            }),
          ),
        ),
      ],
    }),
    card({
      title: 'Reading this list',
      tone: 'gap',
      children: [
        h('p', {}, [
          h('strong', { text: 'NO ALTERNATIVE' }),
          ' means no maritime alternative exists — not that nothing could move. ',
          'Hormuz has pipelines around it; the Turkish Straits have none. ',
          'Where a detour exists, it is a ',
          term('geographic alternative'),
          ' only.',
        ]),
      ],
    }),
  ];

  return {
    title: 'Strategic Chokepoints',
    summary: `${CHOKEPOINTS.length} passages that concentrate global shipping.`,
    cards,
  };
}

function chokepointDetail(ctx, point) {
  const bordering = point.borderingCountries
    .map((iso3) => COUNTRIES.find((c) => c.iso3 === iso3)?.name ?? iso3)
    .join(', ');

  const cards = [
    card({
      tone: 'accent',
      children: [
        h('div', { class: 'ws-selection' }, [
          h('div', { class: 'ws-selection-kind', text: 'Chokepoint' }),
          h('h2', { class: 'ws-selection-name', text: point.name }),
        ]),
        h('div', { class: 'ws-btn-row' }, [
          button({
            label: '← All chokepoints',
            tone: 'ghost',
            onClick: () => {
              ctx.state.chokepointId = null;
              ctx.refresh();
            },
          }),
          button({
            label: 'Show on globe',
            onClick: () =>
              ctx.globe.flyTo({ lat: point.lat, lon: point.lon, altKm: 900 }),
          }),
        ]),
      ],
    }),

    // Requirement 12: answer the question instead of drawing a line.
    card({
      title: 'Why it matters',
      children: [h('p', { text: point.significance })],
    }),

    card({
      title: 'What passes through here',
      children: [
        point.carries?.length
          ? h(
              'div',
              { class: 'ws-list' },
              point.carries.map((cargo) =>
                rankRow({ label: cargo, value: '●' }),
              ),
            )
          : emptyState({ what: 'cargo categories' }),
        point.transitVolume === null
          ? unavailableState({
              what: 'How much passes through, in tonnes or barrels per day.',
              because:
                'The US EIA and UNCTAD publish chokepoint transit volumes, but neither is integrated here, and a remembered figure is a fabricated one.',
              wouldNeed:
                'EIA World Oil Transit Chokepoints, or UNCTAD maritime statistics.',
              instead:
                'The cargo categories above are documented. Trade values by commodity are in Analyze → Product Supply Chain.',
            })
          : null,
      ],
    }),

    card({
      title: 'What happens if it closes',
      tone: point.detourVia ? 'default' : 'warn',
      children: [
        point.detourVia
          ? h('p', {}, [
              h('strong', { text: 'Alternative: ' }),
              point.detourVia,
            ])
          : h('p', {}, [
              h('strong', { text: 'There is no maritime alternative.' }),
            ]),
        h('p', { text: point.detourNote }),
        button({
          label: 'Run the closure scenario',
          tone: 'primary',
          onClick: () => {
            ctx.state.disruptionTarget = point.id;
            ctx.navigate('disruption');
          },
        }),
      ],
    }),

    card({
      title: 'Where and who',
      children: [
        facts([
          ['Connects', point.connects.join(' ↔ ')],
          ['Bordering', bordering],
          [
            'Position',
            `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`,
            true,
          ],
        ]),
      ],
    }),

    card({
      title: 'Sources',
      collapsible: true,
      startCollapsed: true,
      children: [
        h(
          'ul',
          { class: 'ws-prov-limits' },
          point.sources.map((source) => h('li', { text: source })),
        ),
      ],
    }),
  ];

  return {
    title: point.name,
    summary: point.connects.join(' ↔ '),
    cards,
    nextFrom: 'chokepoints',
  };
}

/* ------------------------------------------------------------------ *
 * 4. Disruption
 * ------------------------------------------------------------------ */

function disruptionView(ctx) {
  const data = ctx.console.getData();
  const targetId = ctx.state.disruptionTarget ?? CHOKEPOINTS[0].id;
  const target = CHOKEPOINTS.find((c) => c.id === targetId);
  const scenario = data.scenario;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Removing one passage from the network and recomputing the shortest path.',
          why: 'It answers a concrete question — how much further would this have to travel — without pretending to answer an economic one.',
          dataClass: 'SIMULATED',
        }),
      ],
    }),
    card({
      title: 'Close a chokepoint',
      children: [
        field({
          label: 'Which passage',
          control: select({
            options: CHOKEPOINTS.map((c) => [c.id, c.name]),
            value: targetId,
            ariaLabel: 'Chokepoint to close',
            onChange: (value) => {
              ctx.state.disruptionTarget = value;
              ctx.refresh();
            },
          }),
        }),
        button({
          label: `Close ${target.name}`,
          tone: 'danger',
          onClick: () => {
            ctx.layers.setEnabled('chokepoints', true);
            ctx.console.simulate(targetId);
            ctx.globe.flyTo({ lat: target.lat, lon: target.lon, altKm: 2500 });
            ctx.refresh();
          },
        }),
      ],
    }),
  ];

  if (!scenario) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'scenario results',
            suggestion:
              'Choose a passage above and close it to see what reroutes.',
          }),
        ],
      }),
    );
  } else if (scenario.noLane) {
    // An honest outcome, not a failure: nothing in the demonstration network's
    // shortest paths crosses this node. The Cape of Good Hope is the standing
    // case — it is where traffic goes when Suez is avoided, so it is never on a
    // shortest path while Suez is open.
    cards.push(
      card({
        tone: 'gap',
        children: [
          unavailableState({
            what: `Nothing in this network routes through ${target.name} by default.`,
            because:
              'It is an alternative rather than a shortest path — traffic reaches it only when something else is closed. Closing it therefore changes no baseline route here.',
            wouldNeed:
              'A network carrying lanes that use it as a primary route, or a scenario that closes Suez first.',
            instead: `Close the Suez Canal and watch traffic move onto ${target.name}.`,
          }),
          button({
            label: 'Close Suez Canal instead',
            tone: 'primary',
            onClick: () => {
              ctx.state.disruptionTarget = 'suez';
              ctx.console.simulate('suez');
              ctx.refresh();
            },
          }),
        ],
      }),
    );
  } else {
    // Field names come from simulateDisruption(): `before` and `after` are
    // described routes and the comparison lives in `delta`. Reading them from a
    // guessed shape produced a row of "n/a" that looked like missing data.
    const result = scenario.result;
    const before = result?.before;
    const after = result?.after;
    const delta = result?.delta;
    const severed = result?.reachableAfter === false;

    cards.push(
      card({
        title: 'Before and after',
        tone: 'accent',
        children: [
          metricRow([
            metric({
              value: km(before?.distanceKm),
              label: 'normal route',
            }),
            metric({
              value: severed ? 'no route' : km(after?.distanceKm),
              label: 'alternative route',
              tone: severed ? 'warn' : 'default',
            }),
            metric({
              value: Number.isFinite(delta?.additionalDistanceKm)
                ? `+${km(delta.additionalDistanceKm)}`
                : '\u2014',
              label: 'extra distance',
              tone: 'warn',
            }),
          ]),
          Number.isFinite(delta?.additionalHours)
            ? h('p', {}, [
                'At the modelled speed that is about ',
                h('strong', {
                  text: `${(delta.additionalHours / 24).toFixed(1)} extra days`,
                }),
                ' per voyage, and ',
                h('strong', {
                  text: `${((delta.distanceRatio ?? 1) * 100 - 100).toFixed(0)}% further`,
                }),
                '.',
              ])
            : null,
          severed ? h('p', { text: result.note }) : null,
        ],
      }),
    );

    if (before?.nodeNames?.length && after?.nodeNames?.length) {
      cards.push(
        card({
          title: 'The two paths',
          children: [
            h('p', {}, [
              h('strong', { text: 'Normally: ' }),
              before.nodeNames.join(' \u2192 '),
            ]),
            h('p', {}, [
              h('strong', { text: 'Instead: ' }),
              after.nodeNames.join(' \u2192 '),
            ]),
          ],
        }),
      );
    }

    if (result?.alternatives?.length) {
      cards.push(
        card({
          title: 'Other routes the model found',
          subtitle: 'Ranked by cost, each labelled with how usable it looks.',
          children: [
            h(
              'div',
              { class: 'ws-list' },
              result.alternatives.slice(0, 5).map((route, index) =>
                rankRow({
                  label: h('span', {}, [
                    h('strong', {
                      text: `${index + 1}. ${km(route.distanceKm)}`,
                    }),
                    h('span', {
                      class: 'ws-list-note',
                      text: route.nodeNames.join(' \u2192 '),
                    }),
                  ]),
                  value: route.classification?.label ?? 'geographic',
                }),
              ),
            ),
            h('p', {}, [
              'Every one is a ',
              term('geographic alternative'),
              '. Whether a carrier would sail it depends on capacity, schedules and rates, which are paid data this project does not hold.',
            ]),
          ],
        }),
      );
    }

    if (scenario.reach) {
      cards.push(
        card({
          title: 'What else is connected',
          subtitle: `${scenario.reach.totalReached} nodes within reach of the closure.`,
          children: [
            h(
              'div',
              { class: 'ws-list' },
              [
                ['Directly on the closed route', scenario.reach.direct],
                ['One hop away', scenario.reach.secondary],
                ['Two hops away', scenario.reach.tertiary],
                ['Further out', scenario.reach.beyond],
              ]
                .filter(([, nodes]) => nodes?.length)
                .map(([label, nodes]) =>
                  rankRow({
                    label,
                    value: String(nodes.length),
                    note: nodes
                      .slice(0, 4)
                      .map((n) => n.name ?? n.id)
                      .join(', '),
                  }),
                ),
            ),
            scenario.reach.exposedCountries?.length
              ? h('p', {}, [
                  h('strong', { text: 'Countries in reach: ' }),
                  scenario.reach.exposedCountries.slice(0, 20).join(', '),
                ])
              : null,
            h('p', {}, [
              h('strong', { text: 'Being in a tier is not an impact. ' }),
              'It means connected within N hops, unweighted and without timing. A trivial trade link counts the same as a dominant one.',
            ]),
          ],
        }),
      );
    }

    cards.push(
      card({
        title: 'What this does not say',
        tone: 'gap',
        children: [
          unavailableState({
            what: 'The economic consequence of this closure.',
            because:
              'Turning a reroute into a price or a shortage needs input-output models and elasticities. This project computes topology and distance.',
            wouldNeed: 'A CGE or input-output model with trade elasticities.',
            instead:
              'Extra distance and modelled days above are real outputs of a real graph over real geography.',
          }),
        ],
      }),
    );

    if (result?.provenance) {
      cards.push(card({ children: [provenanceBlock(result.provenance)] }));
    }
  }

  return {
    title: 'Disruption',
    summary: 'Close something and see what has to move instead.',
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 5. Product supply chain (commodity)
 * ------------------------------------------------------------------ */

function commodityView(ctx) {
  const data = ctx.console.getData();
  const group = COMMODITY_GROUPS.find((g) => g.key === data.commodity);
  const reporterCountry = COUNTRIES.find((c) => c.iso3 === data.reporter);
  const cards = [];

  cards.push(
    card({
      children: [
        whyThisMatters({
          what: 'Who ships a given product to whom, measured at customs.',
          why: 'Trade data is the only global, comparable record of what actually crossed a border. It is the backbone of every other view here.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
  );

  cards.push(
    card({
      title: 'Choose what to trace',
      children: [
        field({
          label: 'Product',
          control: select({
            options: COMMODITY_GROUPS.map((g) => [g.key, g.label]),
            value: data.commodity,
            ariaLabel: 'Product',
            onChange: (value) => {
              ctx.console.setCommodity(value);
              ctx.refresh();
            },
          }),
          hint: group
            ? `${term('hs code').textContent} ${group.hsHeadings.join(', ')}`
            : null,
        }),
        field({
          label: 'Country',
          control: select({
            options: COUNTRIES.filter((c) => c.m49 !== null)
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => [c.iso3, c.name]),
            value: data.reporter,
            ariaLabel: 'Reporting country',
            onChange: (value) => {
              ctx.console.setReporter(value);
              ctx.refresh();
            },
          }),
        }),
        field({
          label: 'Direction',
          control: select({
            options: [
              ['M', 'Imports — what it buys'],
              ['X', 'Exports — what it sells'],
            ],
            value: data.flow,
            ariaLabel: 'Direction',
            onChange: (value) => {
              ctx.console.setFlow(value);
              ctx.refresh();
            },
          }),
        }),
        button({
          label: 'Show trade flows',
          tone: 'primary',
          onClick: async () => {
            ctx.layers.setEnabled('trade-flows', true);
            await ctx.console.run();
            ctx.refresh();
          },
        }),
      ],
    }),
  );

  if (data.loading) {
    cards.push(
      card({ children: [loadingState('trade data from UN Comtrade')] }),
    );
  } else if (data.error) {
    cards.push(
      card({
        children: [
          errorState({
            what: 'trade data',
            detail: data.error,
            onRetry: async () => {
              await ctx.console.run();
              ctx.refresh();
            },
          }),
        ],
      }),
    );
  } else if (!data.result) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'trade flows loaded yet',
            suggestion: 'Press "Show trade flows" above.',
          }),
        ],
      }),
    );
  } else {
    const { countries, aggregates, world, provenance } = data.result;
    const total = world?.valueUsd ?? 0;
    // partitionPartners() returns RAW ROWS: partnerCode and valueUsd, with no
    // name and no position. Rendering row.name gave a list of blank labels.
    // `isReported` is also not what marks an aggregate — it flags a
    // Comtrade-derived estimate, and reading it as "aggregate code" labelled
    // every single row as one.
    const aggregateCodes = new Set(
      (aggregates ?? []).map((r) => r.partnerCode),
    );
    const ranked = [...(countries ?? []), ...(aggregates ?? [])]
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 12)
      .map((row) => {
        const area = interpretArea(row.partnerCode);
        const place = COUNTRIES.find((c) => c.m49 === row.partnerCode) ?? null;
        return {
          ...row,
          name: place?.name ?? area.name ?? `Code ${row.partnerCode}`,
          lat: place?.lat ?? null,
          lon: place?.lon ?? null,
          isAggregateCode: aggregateCodes.has(row.partnerCode),
          likelyMeans: area.likelyMeans ?? null,
        };
      });

    cards.push(
      card({
        title: data.flow === 'M' ? 'Where it comes from' : 'Where it goes',
        subtitle: `${reporterCountry?.name ?? data.reporter}, ${data.year}`,
        children: [
          h(
            'div',
            { class: 'ws-list' },
            ranked.map((row) =>
              rankRow({
                label: row.name,
                value: usd(row.valueUsd),
                share: total > 0 ? row.valueUsd / total : null,
                inferred: row.isAggregateCode,
                note: row.isAggregateCode
                  ? row.likelyMeans
                    ? `aggregate code \u2014 read as ${row.likelyMeans}, which is an inference`
                    : 'aggregate code \u2014 a group of places, not one country'
                  : null,
                onClick:
                  row.lat != null && row.lon != null
                    ? () =>
                        ctx.globe.flyTo({
                          lat: row.lat,
                          lon: row.lon,
                          altKm: 4000,
                        })
                    : null,
              }),
            ),
          ),
          (aggregates ?? []).length
            ? h('p', {}, [
                'Amber bars are ',
                term('aggregate code', 'aggregate codes'),
                ' — a group of places, not a single country.',
              ])
            : null,
        ],
      }),
    );

    const hhi = data.result.concentration?.hhi;
    if (hhi?.value != null) {
      cards.push(
        card({
          title: 'How concentrated this is',
          children: [
            metricRow([
              metric({
                value: hhi.value.toFixed(3),
                label: h('span', {}, [term('hhi', 'HHI')]),
                tone: hhi.value > 0.25 ? 'warn' : 'default',
              }),
              metric({
                value: hhi.effectiveCount.toFixed(1),
                label: 'effective suppliers',
              }),
              metric({
                value: `${((data.result.concentration?.cr4 ?? 0) * 100).toFixed(0)}%`,
                label: h('span', {}, [term('cr4', 'top 4 share')]),
              }),
            ]),
            h('p', { text: hhi.interpretation }),
          ],
        }),
      );
    }

    cards.push(card({ children: [provenanceBlock(provenance)] }));
  }

  return {
    title: 'Product Supply Chain',
    summary: group ? group.label : 'Trace one product through world trade.',
    cards,
    nextFrom: 'commodity',
  };
}

/* ------------------------------------------------------------------ *
 * 6. Country
 * ------------------------------------------------------------------ */

function countryView(ctx) {
  const data = ctx.console.getData();
  const iso3 = ctx.state.countryIso3 ?? data.reporter;
  const country = COUNTRIES.find((c) => c.iso3 === iso3);

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'What one country buys, sells, and cannot do without.',
          why: 'Dependency is only visible from a country’s own side of the ledger — what share of a critical import comes from how few places.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
    card({
      title: 'Choose a country',
      children: [
        field({
          label: 'Country',
          control: select({
            options: COUNTRIES.filter((c) => c.m49 !== null)
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => [c.iso3, c.name]),
            value: iso3,
            ariaLabel: 'Country',
            onChange: (value) => {
              ctx.state.countryIso3 = value;
              ctx.console.setReporter(value);
              const next = COUNTRIES.find((c) => c.iso3 === value);
              if (next)
                ctx.globe.flyTo({ lat: next.lat, lon: next.lon, altKm: 4000 });
              ctx.refresh();
            },
          }),
        }),
      ],
    }),
  ];

  if (!country) {
    cards.push(card({ children: [emptyState({ what: 'country selected' })] }));
    return { title: 'Country', summary: '', cards };
  }

  // Ports inside a rough bounding radius of the country centroid. Honest about
  // being a proximity heuristic, because that is what it is.
  const nearbyPorts = MAJOR_PORTS.filter(
    (port) =>
      Math.abs(port.lat - country.lat) < 12 &&
      Math.abs(port.lon - country.lon) < 14,
  ).slice(0, 8);

  cards.push(
    card({
      title: country.name,
      tone: 'accent',
      children: [
        facts([
          ['ISO3', country.iso3, true],
          ['M49 code', country.m49 ?? 'does not report', true],
          [
            'Position',
            `${country.lat.toFixed(2)}, ${country.lon.toFixed(2)}`,
            true,
          ],
        ]),
        country.m49 === null
          ? unavailableState({
              what: `${country.name} does not report trade to UN Comtrade.`,
              because:
                'It is not a reporting member, so it files no statistics into the system this app reads.',
              wouldNeed: 'Membership, or a licensed commercial trade database.',
              instead:
                'Its trade is partly visible through what its partners report — see mirror statistics.',
            })
          : null,
      ],
    }),
  );

  cards.push(
    card({
      title: 'Trade',
      children: [
        h('p', {}, [
          'Open ',
          h('strong', { text: 'Product Supply Chain' }),
          ' with this country selected to see what it buys and sells, by product.',
        ]),
        h('div', { class: 'ws-btn-row' }, [
          button({
            label: 'See its imports',
            onClick: () => {
              ctx.console.setReporter(iso3);
              ctx.console.setFlow('M');
              ctx.navigate('commodity');
            },
          }),
          button({
            label: 'See its exports',
            onClick: () => {
              ctx.console.setReporter(iso3);
              ctx.console.setFlow('X');
              ctx.navigate('commodity');
            },
          }),
        ]),
      ],
    }),
  );

  cards.push(
    card({
      title: 'Ports near it',
      subtitle:
        'From the World Port Index, by proximity to the country centroid.',
      children: nearbyPorts.length
        ? [
            h(
              'div',
              { class: 'ws-list' },
              nearbyPorts.map((port) =>
                rankRow({
                  label: port.name,
                  value: port.harborSize ?? '—',
                  note: port.unlocode ?? null,
                  onClick: () => {
                    ctx.layers.setEnabled('supply-ports', true);
                    ctx.globe.flyTo({
                      lat: port.lat,
                      lon: port.lon,
                      altKm: 300,
                    });
                  },
                }),
              ),
            ),
            h('p', {}, [
              'Proximity to a centroid is a rough filter, not a claim of national ownership. ',
              'A port in this list may belong to a neighbour.',
            ]),
          ]
        : [
            emptyState({
              what: 'ports within range of this centroid',
              suggestion:
                'Landlocked countries and small states often have none.',
            }),
          ],
    }),
  );

  cards.push(
    card({
      title: 'What is not here',
      tone: 'gap',
      children: [
        unavailableState({
          what: 'Domestic infrastructure: rail corridors, road freight, airports with cargo tonnage.',
          because:
            'No open global dataset covers freight rail or road corridors, and airport cargo tonnage is published per-authority or under IATA licence.',
          wouldNeed:
            'Per-country freight statistics, or a commercial logistics database.',
          instead:
            'Ports above, and live aircraft and vessels in Live Transport.',
        }),
      ],
    }),
  );

  return {
    title: country.name,
    summary: 'Country profile — trade, ports and dependencies.',
    cards,
    nextFrom: 'country',
  };
}

/* ------------------------------------------------------------------ *
 * 7. Resource
 * ------------------------------------------------------------------ */

function resourceView(ctx) {
  const data = ctx.console.getData();
  const production = data.production;
  const group = COMMODITY_GROUPS.find((g) => g.key === data.commodity);

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Which countries ship the most of a given raw material or product.',
          why: 'It is the closest open answer to "where does this come from" — but it measures exports, not production, and those differ.',
          dataClass: 'INFERRED',
        }),
      ],
    }),
    card({
      title: 'This is exports, not production',
      tone: 'warn',
      children: [
        h('p', {}, [
          'No open production dataset is integrated. Three things this distorts: ',
          h('strong', { text: 're-export hubs' }),
          ' appear as producers, ',
          h('strong', { text: 'domestic consumption is invisible' }),
          ', and ',
          h('strong', { text: 'value is not volume' }),
          '.',
        ]),
      ],
    }),
    card({
      title: 'Choose a resource',
      children: [
        field({
          label: 'Resource or product',
          control: select({
            options: COMMODITY_GROUPS.map((g) => [g.key, g.label]),
            value: data.commodity,
            ariaLabel: 'Resource',
            onChange: (value) => {
              ctx.console.setCommodity(value);
              ctx.refresh();
            },
          }),
        }),
        button({
          label: 'Map world exporters',
          tone: 'primary',
          onClick: async () => {
            await ctx.console.loadProduction();
            ctx.refresh();
          },
        }),
      ],
    }),
  ];

  if (!production) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'exporter ranking loaded yet',
            suggestion:
              'Press "Map world exporters". It takes a few seconds — the world is 216 reporters.',
          }),
        ],
      }),
    );
  } else {
    const top = production.producers.slice(0, 12);
    cards.push(
      card({
        title: `Top exporters — ${production.commodityLabel}`,
        subtitle: `${production.period} · ${production.producers.length} reporting exporters`,
        children: [
          h(
            'div',
            { class: 'ws-list' },
            top.map((row) =>
              rankRow({
                label: row.name,
                value: usd(row.valueUsd),
                share: row.share,
                inferred: Boolean(row.reexportHub),
                note: row.reexportHub
                  ? 're-export hub — ships goods made elsewhere'
                  : null,
                onClick:
                  row.lat != null
                    ? () =>
                        ctx.globe.flyTo({
                          lat: row.lat,
                          lon: row.lon,
                          altKm: 4000,
                        })
                    : null,
              }),
            ),
          ),
        ],
      }),
    );

    if (production.concentration?.hhi?.value != null) {
      cards.push(
        card({
          title: 'How concentrated production is',
          children: [
            metricRow([
              metric({
                value: production.concentration.hhi.value.toFixed(3),
                label: h('span', {}, [term('hhi', 'HHI')]),
              }),
              metric({
                value: production.concentration.hhi.effectiveCount.toFixed(1),
                label: 'effective exporters',
              }),
            ]),
          ],
        }),
      );
    }

    if (production.incompleteReporters?.length) {
      cards.push(
        card({
          tone: 'gap',
          children: [
            unavailableState({
              what: `${production.incompleteReporters.length} reporter(s) returned a truncated page and may be understated.`,
              because:
                'The upstream endpoint caps a response at 500 rows and does not flag it.',
              wouldNeed: 'A narrower query, or the paid Comtrade API.',
              instead: `Named: ${production.incompleteReporters.join(', ')}.`,
            }),
          ],
        }),
      );
    }

    cards.push(card({ children: [provenanceBlock(production.provenance)] }));
  }

  return {
    title: 'Resource',
    summary: group ? group.label : 'Where a material comes from.',
    cards,
    nextFrom: 'resource',
  };
}

/* ------------------------------------------------------------------ *
 * 8. Events
 * ------------------------------------------------------------------ */

function eventsView(ctx) {
  const data = ctx.console.getData();
  const events = data.events;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Natural hazards happening now, and the ports and chokepoints within 500 km of them.',
          why: 'An event on its own tells you nothing. An event next to a port you depend on is the start of a question.',
          dataClass: 'LIVE',
        }),
      ],
    }),
    card({
      title: 'What this feed does and does not carry',
      tone: 'warn',
      children: [
        h('p', {}, [
          h('strong', { text: 'Carries: ' }),
          'earthquakes, cyclones, floods, volcanoes, droughts, wildfires.',
        ]),
        h('p', {}, [
          h('strong', { text: 'Does not carry: ' }),
          'strikes, port closures, sanctions, trade restrictions, conflict. ',
          'An empty map is not evidence that nothing happened.',
        ]),
      ],
    }),
    card({
      children: [
        button({
          label: events ? 'Refresh events' : 'Load current events',
          tone: 'primary',
          onClick: async () => {
            await ctx.console.loadEvents();
            ctx.refresh();
          },
        }),
      ],
    }),
  ];

  if (!events) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'events loaded yet',
            suggestion: 'Press "Load current events" above.',
          }),
        ],
      }),
    );
  } else if (events.events.length === 0) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'active hazard events in the feed',
            suggestion: 'That is a genuine quiet period, not a failure.',
          }),
        ],
      }),
    );
  } else {
    cards.push(
      card({
        title: 'Near supply-chain infrastructure',
        subtitle: `${events.exposed.length} of ${events.events.length} events are within 500 km of a port or chokepoint.`,
        children: [
          events.exposed.length === 0
            ? emptyState({
                what: 'events near tracked infrastructure',
                suggestion:
                  'Events are active, but none is near a port or chokepoint.',
              })
            : h(
                'div',
                { class: 'ws-list' },
                events.exposed.slice(0, 10).map((event) =>
                  rankRow({
                    label: h('span', {}, [
                      h('strong', {
                        text: `${event.eventLabel} — ${event.country ?? '—'}`,
                      }),
                      h('span', {
                        class: 'ws-list-note',
                        text: event.nearby
                          .map(
                            (n) => `${n.name} (${Math.round(n.distanceKm)} km)`,
                          )
                          .join(', '),
                      }),
                    ]),
                    value: event.alertLevel ?? '—',
                    onClick: () => {
                      ctx.layers.setEnabled('supply-events', true);
                      ctx.globe.flyTo({
                        lat: event.lat,
                        lon: event.lon,
                        altKm: 1200,
                      });
                    },
                  }),
                ),
              ),
          h('p', {}, [
            'Being near something is ',
            term('chokepoint_exposure', 'exposure'),
            ', not impact. A cyclone 200 km from a port may close it for a week or miss it entirely.',
          ]),
        ],
      }),
    );

    cards.push(card({ children: [provenanceBlock(events.provenance)] }));
  }

  return {
    title: 'Global Events',
    summary: 'Live hazards, connected to the infrastructure near them.',
    cards,
    nextFrom: 'events',
  };
}

/* ------------------------------------------------------------------ *
 * 9. Trade routes
 * ------------------------------------------------------------------ */

function routesView(ctx) {
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'The paths goods take between ports, and the passages those paths cross.',
          why: 'A route is where trade data and geography meet: customs says what moved, the route says what it had to pass through to get there.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
    card({
      title: 'Put routes on the globe',
      children: [
        h('div', { class: 'ws-btn-row' }, [
          button({
            label: 'Show ports',
            onClick: () => {
              ctx.layers.setEnabled('supply-ports', true);
              ctx.refresh();
            },
          }),
          button({
            label: 'Show chokepoints',
            onClick: () => {
              ctx.layers.setEnabled('chokepoints', true);
              ctx.refresh();
            },
          }),
          button({
            label: 'Show trade arcs',
            onClick: async () => {
              ctx.layers.setEnabled('trade-flows', true);
              await ctx.console.run();
              ctx.refresh();
            },
          }),
        ]),
      ],
    }),
    card({
      title: 'What the arcs are',
      children: [
        h('p', {}, [
          'Trade arcs are drawn between country centroids, weighted by value. They are ',
          h('strong', { text: 'not' }),
          ' sailing routes — a great-circle arc over land is a data visualisation, not a claim that a ship went that way.',
        ]),
        h('p', {}, [
          'Sailed paths are computed separately, over the port and chokepoint graph, in ',
          h('strong', { text: 'Disruption' }),
          '.',
        ]),
      ],
    }),
    card({
      title: 'Transport modes',
      subtitle: 'What this project can and cannot draw.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          LAYER_NAMES.filter((l) =>
            ['ais-live-vessels', 'flights', 'transit', 'traffic'].includes(
              l.id,
            ),
          ).map((entry) =>
            rankRow({
              label: `${entry.icon} ${entry.name}`,
              value: 'available',
              note: entry.caveat ?? entry.summary,
            }),
          ),
        ),
        h(
          'div',
          { class: 'ws-list' },
          LAYER_NAMES.filter((l) => !l.available).map((entry) =>
            rankRow({
              label: `${entry.icon} ${entry.name}`,
              value: 'no data',
              note: entry.missing,
            }),
          ),
        ),
      ],
    }),
  ];

  return {
    title: 'Trade Routes',
    summary: 'How goods physically travel, and what that does not show.',
    cards,
    nextFrom: 'routes',
  };
}

/* ------------------------------------------------------------------ *
 * 10. Tracking
 * ------------------------------------------------------------------ */

/** Singular nouns for the track view, because "Individual Ships" reads wrong. */
const TRACK_SINGULAR = Object.freeze({
  'ais-live-vessels': 'One vessel at a time',
  flights: 'One aircraft at a time',
  satellites: 'One satellite at a time',
  transit: 'One transit vehicle at a time',
  'supply-ports': 'One port at a time',
});

function trackView(ctx) {
  const item = ctx.state.navId ? ctx.state.trackItem : null;
  const layerId = item?.layerId ?? 'ais-live-vessels';
  const entry = layerName(layerId);
  const enabled = ctx.layers.isEnabled(layerId);
  const stats = ctx.layers.get(layerId)?.getStats?.() ?? {};
  const selection = ctx.state.selection;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: TRACK_SINGULAR[layerId] ?? 'One object at a time.',
          why: 'Click one on the globe and the camera follows it. This is the only part of the system where you watch a single thing rather than an aggregate.',
          dataClass: layerId === 'supply-ports' ? 'HISTORICAL' : 'LIVE',
        }),
      ],
    }),
    card({
      title: entry?.name ?? layerId,
      subtitle: entry?.summary,
      children: [
        h('div', { class: 'ws-btn-row' }, [
          button({
            label: enabled ? 'Turn layer off' : 'Turn layer on',
            tone: enabled ? 'default' : 'primary',
            onClick: () => {
              ctx.layers.setEnabled(layerId, !enabled);
              ctx.refresh();
            },
          }),
          selection
            ? button({
                label: 'Stop following',
                tone: 'danger',
                onClick: () => {
                  ctx.globe.stopTracking();
                  ctx.refresh();
                },
              })
            : null,
        ]),
        entry?.caveat
          ? h('p', { class: 'ws-field-hint', text: `⚠ ${entry.caveat}` })
          : null,
        enabled && stats.error
          ? errorState({
              what: entry?.name?.toLowerCase() ?? 'this layer',
              detail: stats.error,
              onRetry: () => {
                ctx.layers.setEnabled(layerId, false);
                ctx.layers.setEnabled(layerId, true);
                ctx.refresh();
              },
            })
          : null,
        enabled && !stats.error && stats.count === 0
          ? emptyState({
              what: `${entry?.name?.toLowerCase() ?? 'objects'} in view`,
              suggestion:
                'Zoom out, or move to a region with better receiver coverage.',
            })
          : null,
      ],
    }),
  ];

  if (selection) {
    cards.push(
      card({
        title: 'Following',
        tone: 'accent',
        children: [
          h('div', { class: 'ws-selection' }, [
            h('div', {
              class: 'ws-selection-kind',
              text: selection.kind ?? 'Object',
            }),
            h('h2', {
              class: 'ws-selection-name',
              text: selection.label ?? 'Unnamed',
            }),
          ]),
          facts(
            Object.entries(selection.facts ?? {}).map(([key, value]) => [
              key,
              value,
              true,
            ]),
          ),
          selection.caveat
            ? h('p', { class: 'ws-field-hint', text: selection.caveat })
            : null,
        ],
      }),
    );
  } else if (enabled) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'object selected',
            suggestion:
              'Click any marker on the globe to select and follow it.',
          }),
        ],
      }),
    );
  }

  if (layerId === 'ais-live-vessels') {
    cards.push(
      card({
        title: 'What a vessel does not tell you',
        tone: 'gap',
        children: [
          unavailableState({
            what: 'What cargo this ship is carrying.',
            because:
              'AIS broadcasts position, course, speed, navigational status, a self-declared destination and a vessel type. There is no cargo field in the standard.',
            wouldNeed:
              'Bills of lading or customs manifests — commercial data (Panjiva, ImportGenius).',
            instead:
              'Vessel type narrows it: a tanker is carrying liquid bulk. That is a category, not a manifest.',
          }),
        ],
      }),
    );
  }

  return {
    title: entry?.name ?? 'Track',
    summary: 'Click a marker on the globe to follow it.',
    cards,
    nextFrom: 'transport',
  };
}

/* ------------------------------------------------------------------ *
 * 11. Layers
 * ------------------------------------------------------------------ */

function layersView(ctx) {
  const groups = new Map();
  for (const entry of LAYER_NAMES) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Everything that can be drawn on the globe, and what each layer actually contains.',
          why: 'A layer name is a promise. The ones at the bottom are listed precisely because they cannot keep it.',
        }),
      ],
    }),
  ];

  for (const [group, entries] of groups) {
    const isGapGroup = group === 'Not Available';
    cards.push(
      card({
        title: group,
        tone: isGapGroup ? 'gap' : 'default',
        collapsible: true,
        startCollapsed: isGapGroup,
        children: entries.map((entry) => {
          if (!entry.available) {
            return h('div', {}, [
              h('p', {}, [
                h('strong', { text: `${entry.icon} ${entry.name}` }),
              ]),
              h('p', { class: 'ws-field-hint', text: entry.missing }),
            ]);
          }
          const enabled = ctx.layers.isEnabled(entry.id);
          const stats = ctx.layers.get(entry.id)?.getStats?.() ?? {};
          return h('div', {}, [
            rankRow({
              label: h('span', {}, [
                h('strong', { text: `${entry.icon} ${entry.name}` }),
                h('span', { class: 'ws-list-note', text: entry.summary }),
              ]),
              value: enabled ? (stats.count ?? 'ON') : 'OFF',
              onClick: () => {
                ctx.layers.setEnabled(entry.id, !enabled);
                ctx.refresh();
              },
            }),
            entry.caveat
              ? h('p', { class: 'ws-field-hint', text: `⚠ ${entry.caveat}` })
              : null,
          ]);
        }),
      }),
    );
  }

  return {
    title: 'Map Layers',
    summary: 'Turn things on and off, and see what each one is.',
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 12. Route (single route inspection)
 * ------------------------------------------------------------------ */

function routeView(ctx) {
  const data = ctx.console.getData();
  const group = COMMODITY_GROUPS.find((g) => g.key === data.commodity);
  const reporters = COUNTRIES.filter((c) => c.m49 !== null)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const fromIso = ctx.state.chainFrom ?? 'KOR';
  const toIso = ctx.state.chainTo ?? 'NLD';
  const origin = COUNTRIES.find((c) => c.iso3 === fromIso);
  const destination = COUNTRIES.find((c) => c.iso3 === toIso);

  // Transit nodes come from a scenario if one has been run, so the chain shows
  // the passages the routing engine actually crossed rather than a guess.
  const scenarioPath = data.scenario?.result?.before?.nodeNames ?? [];
  const transitNodes = CHOKEPOINTS.filter((point) =>
    scenarioPath.includes(point.name),
  ).map((point) => ({ name: point.name, lat: point.lat, lon: point.lon }));

  const chain =
    origin && destination
      ? buildSupplyChain({
          origin,
          destination,
          commodityLabel: group?.label ?? 'Selected product',
          ports: MAJOR_PORTS,
          transitNodes,
          retrievedAt: new Date().toISOString(),
        })
      : null;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'The physical stages a product passes through between two countries.',
          why: 'It is the only view that shows the whole shape of a supply chain — including the five stages no open data can fill, which are the ones that matter when something breaks.',
          dataClass: 'INFERRED',
        }),
      ],
    }),
    card({
      title: 'Pick a pair',
      children: [
        field({
          label: 'Product',
          control: select({
            options: COMMODITY_GROUPS.map((g) => [g.key, g.label]),
            value: data.commodity,
            ariaLabel: 'Product',
            onChange: (value) => {
              ctx.console.setCommodity(value);
              ctx.refresh();
            },
          }),
        }),
        field({
          label: 'From (exporter)',
          control: select({
            options: reporters.map((c) => [c.iso3, c.name]),
            value: fromIso,
            ariaLabel: 'Exporting country',
            onChange: (value) => {
              ctx.state.chainFrom = value;
              ctx.refresh();
            },
          }),
        }),
        field({
          label: 'To (importer)',
          control: select({
            options: reporters.map((c) => [c.iso3, c.name]),
            value: toIso,
            ariaLabel: 'Importing country',
            onChange: (value) => {
              ctx.state.chainTo = value;
              ctx.refresh();
            },
          }),
        }),
        button({
          label: 'Draw this chain on the globe',
          tone: 'primary',
          onClick: () => {
            // Enable first: the layer manager initialises a layer lazily, and
            // pushing a chain into an uninitialised layer used to lose it.
            // The layer now tolerates either order, and this is the clearer one.
            ctx.layers.setEnabled('supply-chain', true);
            ctx.layers.get('supply-chain')?.setChain(chain);
            ctx.layers.setEnabled('country-borders', true);
            if (origin) {
              ctx.globe.flyTo({
                lat: (origin.lat + destination.lat) / 2,
                lon: (origin.lon + destination.lon) / 2,
                altKm: 14000,
              });
            }
            ctx.refresh();
          },
        }),
      ],
    }),
  ];

  if (!chain) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'countries selected',
            suggestion: 'Choose an exporter and an importer above.',
          }),
        ],
      }),
    );
    return { title: 'Trade Route', summary: '', cards, nextFrom: 'routes' };
  }

  cards.push(
    card({
      title: 'What this data can and cannot see',
      tone: 'accent',
      children: [
        metricRow([
          metric({
            value: `${chain.stagesMissing}/${STAGE_KINDS.length}`,
            label: 'stages with no data at all',
            tone: 'warn',
          }),
          metric({ value: km(chain.totalKm), label: 'total distance' }),
          metric({ value: km(chain.seaKm), label: 'of it by sea' }),
        ]),
        h('p', {}, [
          'Distances are great-circle and therefore lower bounds. This chain describes a ',
          h('strong', { text: 'country pair' }),
          ', not a shipment — it does not mean any particular cargo took this path.',
        ]),
      ],
    }),
  );

  cards.push(
    card({
      title: 'The chain, stage by stage',
      subtitle:
        'Every stage in order. The greyed ones have no open data source.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          chain.stages.map((stage, index) =>
            stage.available
              ? rankRow({
                  label: h('span', {}, [
                    h('strong', {
                      text: `${index + 1}. ${stage.name}`,
                    }),
                    h('span', {
                      class: 'ws-list-note',
                      text: `${stage.kind.replace(/_/g, ' ').toLowerCase()} — ${stage.basis ?? ''}`,
                    }),
                  ]),
                  value: stage.dataClass,
                  onClick: () =>
                    ctx.globe.flyTo({
                      lat: stage.lat,
                      lon: stage.lon,
                      altKm: 2000,
                    }),
                })
              : rankRow({
                  label: h('span', {}, [
                    h('strong', { text: `${index + 1}. ${stage.name}` }),
                    h('span', { class: 'ws-list-note', text: stage.because }),
                  ]),
                  value: 'no data',
                }),
          ),
        ),
      ],
    }),
  );

  cards.push(
    card({
      title: 'How each leg travels',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          chain.legs.map((leg) => {
            const mode = transportMode(leg.mode);
            return rankRow({
              label: h('span', {}, [
                h('strong', { text: `${leg.from.name} → ${leg.to.name}` }),
                h('span', { class: 'ws-list-note', text: mode.note }),
              ]),
              value: `${mode.label} · ${km(leg.distanceKm)}`,
            });
          }),
        ),
        h('p', {}, [
          'On the globe: ',
          h('strong', { text: 'solid' }),
          ' is sea, ',
          h('strong', { text: 'dashed' }),
          ' is land, ',
          h('strong', { text: 'dotted' }),
          ' is air. Dash pattern carries the distinction so it survives greyscale.',
        ]),
      ],
    }),
  );

  if (transitNodes.length === 0) {
    cards.push(
      card({
        tone: 'gap',
        children: [
          unavailableState({
            what: 'Which passages the sea leg crosses.',
            because:
              'No maritime route has been computed for this pair yet, so the sea stage is a single hop rather than a path.',
            wouldNeed: 'A routing run over the port and chokepoint network.',
            instead: 'Run a disruption scenario and its path appears here.',
          }),
          button({
            label: 'Go to Disruption',
            onClick: () => ctx.navigate('disruption'),
          }),
        ],
      }),
    );
  }

  cards.push(card({ children: [provenanceBlock(chain.provenance)] }));

  return {
    title: 'Trade Route',
    summary: `${origin.name} → ${destination.name}, ${group?.label ?? ''}`,
    cards,
    nextFrom: 'routes',
  };
}

/* ------------------------------------------------------------------ *
 * 14. Environmental risk
 * ------------------------------------------------------------------ */

function riskView(ctx) {
  const data = ctx.console.getData();
  const iso3 = ctx.state.riskIso3 ?? data.reporter;
  const country = COUNTRIES.find((c) => c.iso3 === iso3);
  const risk = data.environment;
  const loaded = risk?.country?.iso3 === iso3 ? risk : null;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Physical conditions that could interrupt what a country produces.',
          why: 'Water, drought and flood reach trade through one route: they hit the farmland and the infrastructure, and what a country cannot grow it cannot export.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
    card({
      title: 'Choose a country',
      children: [
        field({
          label: 'Country',
          control: select({
            options: COUNTRIES.filter((c) => c.m49 !== null)
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => [c.iso3, c.name]),
            value: iso3,
            ariaLabel: 'Country',
            onChange: (value) => {
              ctx.state.riskIso3 = value;
              ctx.refresh();
            },
          }),
        }),
        button({
          label: 'Load indicators',
          tone: 'primary',
          onClick: async () => {
            await ctx.console.loadEnvironment(iso3);
            if (country) {
              ctx.layers.setEnabled('country-borders', true);
              ctx.globe.flyTo({
                lat: country.lat,
                lon: country.lon,
                altKm: 5000,
              });
            }
            ctx.refresh();
          },
        }),
      ],
    }),
  ];

  if (!loaded) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'indicators loaded yet',
            suggestion: 'Press "Load indicators" above.',
          }),
        ],
      }),
    );
    return {
      title: 'Environmental Risk',
      summary: country ? country.name : '',
      cards,
    };
  }

  // The §22 requirement: the mechanism comes FIRST, before any number.
  cards.push(
    card({
      title: 'How this reaches the supply chain',
      tone: loaded.mechanism ? 'accent' : 'gap',
      children: loaded.mechanism
        ? [
            h(
              'ul',
              { class: 'ws-prov-limits' },
              loaded.mechanism.map((clause) => h('li', { text: clause })),
            ),
          ]
        : [
            unavailableState({
              what: 'A supply-chain mechanism for this country.',
              because: loaded.unlinkedReason,
              instead:
                'The indicators below are real measurements and stand on their own.',
            }),
          ],
    }),
  );

  if (loaded.waterStress || loaded.waterAvailability) {
    cards.push(
      card({
        title: 'Water',
        children: [
          metricRow(
            [
              loaded.waterStress
                ? metric({
                    value: loaded.waterStress.label,
                    label: 'withdrawal vs renewal',
                    tone: ['HIGH', 'VERY_HIGH', 'BEYOND_RENEWABLE'].includes(
                      loaded.waterStress.level,
                    )
                      ? 'warn'
                      : 'default',
                  })
                : null,
              loaded.waterAvailability
                ? metric({
                    value: loaded.waterAvailability.label,
                    label: 'water per person',
                    tone:
                      loaded.waterAvailability.level === 'SUFFICIENT'
                        ? 'good'
                        : 'warn',
                  })
                : null,
            ].filter(Boolean),
          ),
          loaded.waterStress
            ? h('p', { text: loaded.waterStress.basis })
            : null,
          loaded.waterAvailability
            ? h('p', { text: loaded.waterAvailability.basis })
            : null,
        ],
      }),
    );
  }

  cards.push(
    card({
      title: 'The indicators',
      subtitle: 'Each one with how it reaches trade.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          loaded.readings.map((reading) =>
            rankRow({
              label: h('span', {}, [
                h('strong', { text: reading.label }),
                h('span', {
                  class: 'ws-list-note',
                  text: reading.affectsSupplyChain,
                }),
              ]),
              value: reading.available
                ? `${reading.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                : 'no data',
              note: reading.available ? reading.unit : null,
            }),
          ),
        ),
        loaded.readings.some((r) => !r.available)
          ? h('p', {}, [
              'A "no data" row means the World Bank has no observation for this ',
              'country on that series. It does not mean zero.',
            ])
          : null,
      ],
    }),
  );

  cards.push(
    card({
      title: 'Why a national figure can mislead',
      tone: 'gap',
      children: [
        unavailableState({
          what: 'Water stress at the resolution that actually matters — the river basin.',
          because:
            'These are national averages. China\u2019s figure averages the water-rich south with the water-scarce north, and the north is where the wheat is.',
          wouldNeed:
            'WRI Aqueduct basin-level data, which is a bulk download rather than an API.',
          instead:
            'Live hazard events are in Global Events, at the location they actually occurred.',
        }),
        button({
          label: 'See live hazards instead',
          onClick: () => ctx.navigate('events'),
        }),
      ],
    }),
  );

  cards.push(card({ children: [provenanceBlock(loaded.provenance)] }));

  return {
    title: 'Environmental Risk',
    summary: `${loaded.country.name} — water, drought and flood exposure`,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 13. Investigation
 * ------------------------------------------------------------------ */

function investigationView(ctx) {
  const entry = ctx.state.investigation;
  if (!entry) {
    return {
      title: 'Investigations',
      summary: 'Guided sequences that follow one question end to end.',
      cards: [
        card({
          title: 'Choose one',
          children: [
            h(
              'div',
              { class: 'ws-list' },
              INVESTIGATIONS.map((item) =>
                rankRow({
                  label: h('span', {}, [
                    h('strong', { text: item.name }),
                    h('span', { class: 'ws-list-note', text: item.question }),
                  ]),
                  value: `${investigationDurationSec(item)}s`,
                  onClick: () => ctx.openInvestigation(item.id),
                }),
              ),
            ),
          ],
        }),
      ],
    };
  }

  const playbackState = ctx.playback?.getState?.() ?? {
    index: -1,
    total: entry.steps.length,
  };
  const currentStep = playbackState.step;

  const cards = [
    card({
      tone: 'accent',
      children: [
        h('div', { class: 'ws-selection' }, [
          h('div', { class: 'ws-selection-kind', text: 'Investigation' }),
          h('h2', { class: 'ws-selection-name', text: entry.name }),
        ]),
        h('p', {}, [h('strong', { text: entry.question })]),
        h('p', { text: entry.why }),
      ],
    }),
  ];

  if (currentStep) {
    cards.push(
      card({
        title: `Step ${playbackState.index + 1} of ${playbackState.total} — ${currentStep.title}`,
        tone: 'accent',
        children: [
          h('p', {}, [h('strong', { text: currentStep.claim })]),
          currentStep.detail ? h('p', { text: currentStep.detail }) : null,
          dataClassBadge(currentStep.dataClass),
          currentStep.evidence
            ? h('p', { class: 'ws-field-hint' }, [
                h('strong', { text: 'Evidence: ' }),
                currentStep.evidence,
              ])
            : null,
          currentStep.unknown
            ? unavailableState({
                what: 'This step cannot establish:',
                because: currentStep.unknown,
              })
            : null,
        ],
      }),
    );
  }

  cards.push(
    card({
      title: 'All steps',
      subtitle: 'Click any step to jump to it.',
      children: [
        h(
          'div',
          { class: 'ws-list' },
          entry.steps.map((step, index) =>
            rankRow({
              label: h('span', {}, [
                h('strong', { text: `${index + 1}. ${step.title}` }),
                h('span', { class: 'ws-list-note', text: step.claim }),
              ]),
              value: index === playbackState.index ? '▶' : '',
              onClick: () => ctx.playback?.goTo(index),
            }),
          ),
        ),
      ],
    }),
  );

  return {
    title: entry.name,
    summary: entry.question,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

const VIEWS = Object.freeze({
  home: homeView,
  transport: transportView,
  routes: routesView,
  chokepoints: chokepointsView,
  events: eventsView,
  commodity: commodityView,
  country: countryView,
  resource: resourceView,
  route: routeView,
  disruption: disruptionView,
  risk: riskView,
  track: trackView,
  layers: layersView,
  investigation: investigationView,
});

/** Every view name the shell can render. */
export const VIEW_NAMES = Object.freeze(Object.keys(VIEWS));

/**
 * Render a view.
 *
 * Returns `{ title, summary, cards }`. A view that throws is rendered as an
 * error card rather than taking the whole panel down with it — a broken view
 * should cost the user that view, not the application.
 *
 * @param {string} view
 * @param {object} ctx
 * @returns {{title:string, summary:string, cards:HTMLElement[]}}
 */
export function renderView(view, ctx) {
  const render = VIEWS[view];
  if (!render) {
    return {
      title: 'Not found',
      summary: '',
      cards: [
        card({
          children: [
            errorState({
              what: `the "${view}" view`,
              detail: 'This view is not registered.',
              onRetry: () => ctx.navigate('home'),
              retryLabel: 'Back to Global Supply Chain',
            }),
          ],
        }),
      ],
    };
  }
  try {
    const result = render(ctx);
    const steps = nextSteps(result.nextFrom ?? view, ctx.state?.navId);
    if (steps.length) {
      result.cards.push(
        card({ children: [nextStepsBlock(steps, (id) => ctx.navigate(id))] }),
      );
    }
    return result;
  } catch (error) {
    return {
      title: 'This view failed',
      summary: '',
      cards: [
        card({
          tone: 'warn',
          children: [
            errorState({
              what: `the ${view} view`,
              detail: error?.message ?? String(error),
              onRetry: () => ctx.refresh(),
            }),
          ],
        }),
      ],
    };
  }
}
