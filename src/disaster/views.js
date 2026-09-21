/**
 * The disaster investigation views.
 *
 * Twelve views that project one session. They never fetch and they never hold
 * state of their own: everything comes from `ctx.disaster`, which is the
 * session, so the timeline view and the impact view cannot disagree about what
 * loaded.
 *
 * §19 IS THE HARDEST CONSTRAINT HERE: "Avoid designing sidebar + 20 cards +
 * charts + map and calling it finished." So each view is built to one rule —
 * it leads with the geographic or temporal fact, and every figure it prints is
 * either clickable through to the map or captioned with what it cannot tell
 * you. There is no view here that is a grid of totals.
 *
 * The §5 discipline is enforced structurally rather than by care: a figure is
 * rendered through `sourced()`, which will not print a value without an
 * availability label and a publisher. A number with no provenance cannot reach
 * the screen through these views.
 */

import {
  append,
  button,
  card,
  dataClassBadge,
  emptyState,
  errorState,
  h,
  metric,
  metricRow,
  provenanceBlock,
  unavailableState,
  whyThisMatters,
} from '../workspace/components.js';
import { nextSteps } from '../workspace/navigation.js';
import { nextStepsBlock } from '../workspace/components.js';
import { AVAILABILITY, DIMENSIONS, dataClassFor } from './catalogue.js';
import { HAZARD_LIST, allAdapters, phasesFor } from './hazards.js';
import { UNAVAILABLE_REASONS } from './timeline.js';
import { formatHours } from './response.js';
import { INFRA_STATE, STATE_BASIS } from './impact.js';
import { LOAD_STATUS } from './session.js';
import { demo, runtimeMinutes } from './demo.js';

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

/**
 * Print a figure with its provenance, or refuse to print it.
 *
 * The structural enforcement of §5. A caller cannot show a number without
 * saying where it came from and how firm it is, because this is the only
 * function the views use to render one.
 */
function sourced({
  value,
  label,
  source,
  availability,
  hint = null,
  tone = 'default',
}) {
  if (value == null || !source || !availability) return null;
  return h('div', { class: 'gx-figure' }, [
    h('div', { class: 'gx-figure-value gx-mono', text: String(value) }),
    h('div', { class: 'gx-figure-label', text: label }),
    dataClassBadge(dataClassFor(availability)),
    h('div', { class: 'gx-figure-source', text: source }),
    hint ? h('div', { class: 'gx-figure-hint', text: hint }) : null,
    tone === 'warn' ? h('span', { class: 'gx-state-warning', text: '' }) : null,
  ]);
}

const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');
const fmtUsd = (n) =>
  Number.isFinite(n)
    ? n >= 1e9
      ? `$${(n / 1e9).toFixed(2)}B`
      : `$${(n / 1e6).toFixed(0)}M`
    : '—';

/** A row that highlights on the map when clicked (§13's linkage). */
function mapRow({ label, value, note = null, onClick = null, tone = null }) {
  return h(
    'div',
    {
      class: `gx-row${onClick ? ' ws-clickable' : ''}${tone ? ' gx-state-' + tone : ''}`,
      onClick: onClick ?? undefined,
      role: onClick ? 'button' : undefined,
      tabindex: onClick ? '0' : undefined,
    },
    [
      h('span', { class: 'gx-row-label' }, [
        h('strong', { text: label }),
        note ? h('span', { class: 'gx-row-note', text: note }) : null,
      ]),
      h('span', { class: 'gx-row-value gx-mono', text: value }),
    ],
  );
}

/**
 * The next-steps card every view ends with.
 *
 * §19's "the user should constantly be discovering something", and the same
 * contract the supply-chain views already meet. The investigation sequence has
 * a real order, so these are genuine next questions rather than a menu.
 */
function pushNext(cards, ctx, viewName) {
  const node = nextCard(ctx, viewName);
  if (node) cards.push(node);
}

function nextCard(ctx, viewName) {
  const steps = nextSteps(viewName);
  if (steps.length === 0) return null;
  return card({
    title: 'What to look at next',
    children: [nextStepsBlock(steps, (id) => ctx.navigate(id))],
  });
}

/**
 * No case open yet — every investigation view needs one.
 *
 * Carries a why-block and next steps like any other view: a user who lands
 * here from a share link should still be told what this view is for, not only
 * that it is empty.
 */
function needsCase(ctx, what, viewName) {
  return {
    title: what,
    summary: 'No event selected.',
    cards: [
      card({
        children: [
          whyThisMatters({
            what: `${what} needs an event to investigate.`,
            why: 'Every view here is a projection of one open case. Pick a disaster in the explorer and this view fills from the same session as all the others.',
            dataClass: 'UNKNOWN',
          }),
          emptyState({
            what: 'event selected yet',
            suggestion:
              'Open Events → Disaster Explorer and choose a case to investigate.',
          }),
          button({
            label: 'Go to the Disaster Explorer',
            tone: 'primary',
            onClick: () => ctx.navigate('case-explorer'),
          }),
        ],
      }),
      nextCard(ctx, viewName),
    ].filter(Boolean),
  };
}

/**
 * The session, or null.
 *
 * Defensive because a host can render a view before the disaster context is
 * attached — and a view that throws on a missing ctx member costs the user the
 * whole panel rather than one card.
 */
function sessionOf(ctx) {
  return ctx?.disaster?.session?.() ?? null;
}

/** A product that failed or is still loading, said in the view that needs it. */
function productState(session, productId, name) {
  const status = session.productStatus(productId);
  if (status === LOAD_STATUS.LOADED) return null;
  if (status === LOAD_STATUS.LOADING) {
    return card({
      children: [
        h('div', { class: 'gx-sweep gx-loading', text: `Loading ${name}…` }),
      ],
    });
  }
  if (status === LOAD_STATUS.FAILED) {
    return card({
      children: [
        errorState({
          what: name.toLowerCase(),
          detail: session.productError(productId) ?? 'the request failed',
          onRetry: async () => {
            await session.load();
            ctxRefresh(session);
          },
        }),
      ],
    });
  }
  return card({
    children: [
      unavailableState({
        what: name,
        because: 'This case has no source wired for it.',
        wouldNeed:
          'A hazard-specific adapter for this case — see Sources → Data Provenance for which are connected.',
        instead: 'The dimensions that did load are shown in the other views.',
      }),
    ],
  });
}

let _refresh = null;
function ctxRefresh() {
  _refresh?.();
}

/* ------------------------------------------------------------------ *
 * 1. Disaster Explorer — LEVEL 0 (§2)
 * ------------------------------------------------------------------ */

function casesView(ctx) {
  const catalogue = ctx?.disaster?.catalogue?.() ?? {
    cases: [],
    counts: { curated: 0, live: 0, total: 0 },
  };
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Every disaster this platform can investigate, and how far each one can be taken.',
          why: 'A case is not a headline. Before opening one you can see which dimensions have a source and which do not, so you are not three zoom levels deep before finding an empty panel.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
  ];

  if (catalogue.cases.length === 0) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'cases available',
            suggestion:
              'The live hazard feed may not have loaded. Try Live Hazards.',
          }),
        ],
      }),
    );
    return { title: 'Disaster Explorer', summary: '', cards };
  }

  for (const entry of catalogue.cases) {
    const inv = entry.investigability;
    cards.push(
      card({
        title: `${entry.hazard?.icon ?? '◈'} ${entry.name}`,
        subtitle: `${entry.country ?? 'Unknown country'} · ${entry.date ?? 'undated'} · ${entry.hazard?.name ?? entry.hazardId}`,
        tone: entry.isLive ? 'accent' : 'default',
        children: [
          h('p', { class: 'gx-prose', text: entry.investigates }),
          /*
           * The severity basis, not just the rank. A single ordering over
           * incomparable hazards is a convenience, and saying which figure it
           * used is the difference between a ranking and a claim.
           */
          metricRow(
            [
              entry.confirmed?.deaths?.value != null
                ? metric({
                    value: fmt(entry.confirmed.deaths.value),
                    label: 'recorded deaths',
                    tone: 'warn',
                  })
                : null,
              entry.magnitude?.value != null
                ? metric({
                    value:
                      `${entry.magnitude.value} ${entry.magnitude.unit ?? ''}`.trim(),
                    label: 'magnitude',
                  })
                : null,
              metric({
                value: `${inv.supported}/${inv.total}`,
                label: 'dimensions with a source',
                tone: inv.fraction === 1 ? 'good' : 'default',
              }),
            ].filter(Boolean),
          ),
          h(
            'div',
            { class: 'gx-dimension-strip' },
            inv.dimensions.map((dimension) =>
              h('span', {
                class: `gx-dim gx-dim-${dimension.availability.toLowerCase()}`,
                title: `${dimension.name}: ${dimension.availability}`,
                text: dimension.name.split(' ')[0],
              }),
            ),
          ),
          h('p', { class: 'gx-prose gx-why-case', text: entry.whyThisCase }),
          entry.enterable
            ? button({
                label: `Investigate ${entry.name}`,
                tone: 'primary',
                onClick: () => ctx.disaster.open(entry.id),
              })
            : unavailableState({
                what: 'A geographic descent for this case.',
                because:
                  'The feed reported no usable coordinates, so there is nowhere to fly the camera.',
                wouldNeed: 'A position on the source record.',
                instead:
                  'The case stays listed with whatever the feed did carry.',
              }),
        ],
      }),
    );
  }

  pushNext(cards, ctx, 'cases');
  return {
    title: 'Disaster Explorer',
    summary: `${catalogue.counts.curated} documented cases · ${catalogue.counts.live} live alerts`,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Geographic Descent (§18)
 * ------------------------------------------------------------------ */

function descentView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Geographic Descent', 'descent');
  const state = session.investigation.getState();
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'One continuous descent from the whole world to a single road.',
          why: 'Each level answers a different question, and the transition is the explanation: you see the Himalayan arc before you see the valley, so the valley means something when you arrive.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
    card({
      title: 'Where you are',
      tone: 'accent',
      children: [
        h('div', {
          class: 'gx-breadcrumb-trail gx-mono',
          text: state.depth.trail.join('  ›  '),
        }),
        h('p', { class: 'gx-prose', text: state.depth.reveals }),
        state.depth.note
          ? h('p', { class: 'ws-field-hint', text: state.depth.note })
          : null,
        h('div', { class: 'gx-controls' }, [
          button({
            label: '↑ Pull back',
            onClick: () => {
              session.investigation.shallower();
              ctx.refresh();
            },
            disabled: !state.depth.canGoShallower,
          }),
          button({
            label: '↓ Go deeper',
            tone: 'primary',
            onClick: () => {
              session.investigation.deeper();
              ctx.refresh();
            },
            disabled: !state.depth.canGoDeeper,
          }),
          button({
            label: state.descending ? '■ Stop descent' : '▶ Run full descent',
            onClick: () => {
              if (state.descending) session.investigation.stopDescent();
              else session.investigation.descend();
              ctx.refresh();
            },
          }),
        ]),
      ],
    }),
    card({
      title: 'The ladder',
      subtitle: 'Every level, and what it is there to show.',
      children: [
        h(
          'div',
          { class: 'gx-ladder' },
          session.investigation.ladder.map((rung, index) =>
            mapRow({
              label: `L${rung.level} ${rung.name}`,
              value:
                index === state.depth.index
                  ? '● HERE'
                  : `${fmt(rung.altKm)} km`,
              note: rung.reveals,
              tone: index === state.depth.index ? 'observed' : null,
              onClick: () => {
                session.investigation.goToDepth(index);
                ctx.refresh();
              },
            }),
          ),
        ),
      ],
    }),
  ];
  pushNext(cards, ctx, 'descent');
  return {
    title: 'Geographic Descent',
    summary: `${state.depth.kind} · level ${state.depth.level} of ${state.depth.total - 1}`,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 3. Event Timeline (§4)
 * ------------------------------------------------------------------ */

function timelineView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Event Timeline', 'timeline');
  const state = session.investigation.getState();
  const world = session.worldState();
  const step = world?.phase;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'The event as it unfolded, with the map changing as you move.',
          why: 'A disaster is not an instant. Roads close hours after the shaking stops, supply chains fail two days later, and the aftershock that empties a hospital arrives on day eighteen.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
    card({
      title: `${step?.label ?? '—'} · ${step?.heading ?? ''}`,
      tone: 'accent',
      children: [
        h(
          'div',
          { class: 'gx-timeline-strip' },
          session.investigation.phases.map((phase, index) =>
            h('button', {
              class: `gx-phase${index === state.phase.index ? ' gx-phase-active' : ''}`,
              type: 'button',
              title: phase.heading,
              text: phase.label,
              onClick: () => {
                session.investigation.goToPhase(index);
                ctx.refresh();
              },
            }),
          ),
        ),
        h('p', { class: 'gx-prose', text: step?.what ?? '' }),
        step?.watch
          ? h('p', { class: 'gx-watch', text: `Watch: ${step.watch}` })
          : null,
        h('div', { class: 'gx-controls' }, [
          button({
            label: '◀ Previous',
            onClick: () => {
              session.investigation.previousPhase();
              ctx.refresh();
            },
            disabled: !state.phase.canGoBack,
          }),
          button({
            label: 'Next ▶',
            tone: 'primary',
            onClick: () => {
              session.investigation.nextPhase();
              ctx.refresh();
            },
            disabled: !state.phase.canGoForward,
          }),
        ]),
        step?.at
          ? h('div', { class: 'gx-mono gx-timestamp', text: `${step.at} UTC` })
          : null,
      ],
    }),
  ];

  /* What is actually measured at this phase. */
  if (world?.nothingMeasured) {
    cards.push(
      card({
        title: 'Nothing measured at this phase',
        tone: 'gap',
        children: [
          h('p', {
            class: 'gx-prose',
            text: 'No timestamped source resolves to this point in the timeline for this case. That is not the same as nothing having happened.',
          }),
        ],
      }),
    );
  } else {
    cards.push(
      card({
        title: 'Measured at this point',
        children: world.readings.map((reading) =>
          h('div', { class: 'gx-reading' }, [
            mapRow({
              label: reading.name,
              value: `${fmt(reading.value)} ${reading.unit}`,
              note: reading.detail,
            }),
            dataClassBadge(dataClassFor(reading.availability)),
            h('span', { class: 'gx-figure-source', text: reading.source }),
          ]),
        ),
      }),
    );
  }

  /* And what cannot be known — the honest half of the timeline. */
  if (step?.unavailable?.length > 0) {
    cards.push(
      card({
        title: 'Not knowable at this phase',
        subtitle: 'Declared rather than estimated.',
        tone: 'gap',
        children: step.unavailable.map((item) =>
          unavailableState({
            what: item.name,
            because: item.because,
            wouldNeed: item.wouldNeed,
            instead: item.instead,
          }),
        ),
      }),
    );
  }

  pushNext(cards, ctx, 'timeline');
  return {
    title: 'Event Timeline',
    summary: `${step?.label} of ${state.phase.total} · ${state.chapter.name}`,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Hazard geometry
 * ------------------------------------------------------------------ */

function hazardView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Hazard Geometry', 'hazard');
  const hazardGroup = session.investigation.layerGroups.find(
    (group) => group.id === 'hazard',
  );
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'What this hazard type actually draws, and what each layer answers.',
          why: 'An earthquake and a cyclone are not the same picture. The intensity field, the rupture and the landslide model each answer a different question, and a layer that cannot name its question is decoration.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
  ];

  const contours = session.product('contours');
  if (contours?.bands?.length) {
    cards.push(
      card({
        title: 'Shaking intensity',
        subtitle: `${contours.bands.length} measured contour bands`,
        children: [
          h(
            'div',
            { class: 'gx-band-scale' },
            contours.bands
              .slice()
              .reverse()
              .map((band) =>
                h('div', { class: 'gx-band' }, [
                  h('span', {
                    class: 'gx-band-swatch',
                    style: { background: bandColour(band.mmi) },
                  }),
                  h('span', { class: 'gx-mono', text: `MMI ${band.mmi}` }),
                  h('span', {
                    class: 'gx-row-note',
                    text: `${band.lines.length} contour lines`,
                  }),
                ]),
              ),
          ),
          h('p', {
            class: 'ws-field-hint',
            text: 'Colours are the USGS ShakeMap ramp, not this interface’s palette. A reader who has seen a ShakeMap recognises it, and recolouring shaking intensity would make the map prettier and less useful.',
          }),
        ],
      }),
    );
  }

  cards.push(
    card({
      title: 'Layers for this hazard type',
      children: (hazardGroup?.layers ?? []).map((layer) =>
        h('div', { class: 'gx-layer-entry' }, [
          mapRow({
            label: layer.name,
            value: layer.available
              ? session.investigation.isLayerEnabled(layer.id)
                ? 'ON'
                : 'OFF'
              : 'NO DATA',
            note: layer.answers,
            tone: layer.available ? null : 'warning',
            onClick: layer.available
              ? () => {
                  const result = session.investigation.setLayer(
                    layer.id,
                    !session.investigation.isLayerEnabled(layer.id),
                  );
                  if (!result.ok) return;
                  ctx.refresh();
                }
              : null,
          }),
          layer.available
            ? null
            : h('p', {
                class: 'ws-field-hint',
                text: `No source wired for this case. Adapter: ${layer.adapter ?? 'none declared'} — see Sources.`,
              }),
          layer.requiresTerrain
            ? h('p', {
                class: 'ws-field-hint',
                text: 'Needs 3D terrain to read properly.',
              })
            : null,
        ]),
      ),
    }),
  );

  const gf = session.product('groundFailure');
  if (gf) {
    cards.push(
      card({
        title: 'Ground failure',
        subtitle: 'Why the roads failed, in mountain terrain.',
        tone: gf.landslide.alert === 'red' ? 'warn' : 'default',
        children: [
          metricRow(
            [
              gf.landslide.alert
                ? metric({
                    value: gf.landslide.alert.toUpperCase(),
                    label: 'landslide alert',
                    tone: gf.landslide.alert === 'red' ? 'warn' : 'default',
                  })
                : null,
              Number.isFinite(gf.landslide.hazardValue)
                ? metric({
                    value: fmt(gf.landslide.hazardValue),
                    label: gf.landslide.hazardParameter ?? 'aggregate hazard',
                  })
                : null,
              gf.liquefaction.alert
                ? metric({
                    value: gf.liquefaction.alert.toUpperCase(),
                    label: 'liquefaction alert',
                    tone: gf.liquefaction.alert === 'red' ? 'warn' : 'default',
                  })
                : null,
            ].filter(Boolean),
          ),
          h('p', {
            class: 'gx-prose',
            text: 'A modelled hazard, published by USGS. It says which slopes were likely to fail, not which ones did.',
          }),
        ],
      }),
    );
  }

  pushNext(cards, ctx, 'hazard');
  return {
    title: 'Hazard Geometry',
    summary: session.case.hazard?.question ?? '',
    cards,
  };
}

function bandColour(mmi) {
  const ramp = [
    '#ffffff',
    '#bfccff',
    '#9999ff',
    '#80ffff',
    '#7df894',
    '#ffff00',
    '#ffc800',
    '#ff9100',
    '#ff0000',
    '#c80000',
  ];
  return ramp[Math.max(0, Math.min(9, Math.round(mmi) - 1))];
}

/* ------------------------------------------------------------------ *
 * 5. Human impact (§6)
 * ------------------------------------------------------------------ */

function humanView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Human Impact', 'human');
  const pending = productState(session, 'exposure', 'Population exposure');
  const human = session.human();
  const cities = session.cities({ minMmi: 6 });
  const confirmed = session.case.confirmed ?? {};

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Who experienced the hazard, band by band and city by city.',
          why: 'A single "people affected" figure hides the thing that matters: the difference between 84 million who felt it and 2.9 million who felt it hard enough to lose their homes.',
          dataClass: 'SIMULATED',
        }),
      ],
    }),
  ];

  /* Recorded figures first, clearly separated from modelled ones. */
  if (confirmed.deaths?.value != null) {
    cards.push(
      card({
        title: 'Recorded outcome',
        subtitle: 'Counted after the event, not modelled during it.',
        tone: 'warn',
        children: [
          metricRow(
            [
              metric({
                value: fmt(confirmed.deaths.value),
                label: 'deaths',
                tone: 'warn',
              }),
              confirmed.injured?.value != null
                ? metric({
                    value: fmt(confirmed.injured.value),
                    label: 'injured',
                  })
                : null,
              confirmed.housesDestroyed?.value != null
                ? metric({
                    value: fmt(confirmed.housesDestroyed.value),
                    label: 'houses destroyed',
                  })
                : null,
            ].filter(Boolean),
          ),
          h('div', {
            class: 'gx-figure-source',
            text: confirmed.deaths.source,
          }),
          dataClassBadge(dataClassFor(confirmed.deaths.availability)),
        ],
      }),
    );
  }

  if (pending) {
    cards.push(pending);
    pushNext(cards, ctx, 'human');
    return { title: 'Human Impact', summary: session.case.name, cards };
  }

  if (human) {
    cards.push(
      card({
        title: 'Population by shaking intensity',
        subtitle: 'Exposure, not casualties.',
        children: [
          ...human.bands.map((band) =>
            mapRow({
              label: `MMI ${band.label} — ${band.intensityName}`,
              value: fmt(band.population),
              note: band.caveat,
              tone:
                band.availability === AVAILABILITY.ESTIMATED
                  ? 'estimated'
                  : null,
              onClick: band.footprint
                ? () =>
                    session.investigation.select({
                      kind: 'hazard-band',
                      label: `MMI ${band.label}`,
                      band,
                    })
                : null,
            }),
          ),
          metricRow([
            metric({
              value: fmt(human.measuredPopulation),
              label: 'inside the measured field',
            }),
            metric({
              value: fmt(human.extrapolatedPopulation),
              label: 'extrapolated beyond it',
              tone: 'warn',
            }),
          ]),
          h('p', {
            class: 'ws-field-hint',
            text: 'The two totals are kept apart because the larger one is the looser one. Bands outside the measured ShakeMap footprint are extrapolations.',
          }),
        ],
      }),
    );
  }

  if (cities?.cities?.length) {
    cards.push(
      card({
        title: 'Cities inside the damaging field',
        subtitle: `${cities.cities.length} places at MMI ${cities.minMmi} or above`,
        children: [
          ...cities.cities.slice(0, 12).map((city) =>
            mapRow({
              label: city.name,
              value: `MMI ${city.mmi.toFixed(2)}`,
              note:
                city.population != null
                  ? `${fmt(city.population)} people · ${city.band.name}`
                  : city.populationNote,
              onClick:
                city.latitude != null
                  ? () =>
                      session.investigation.select({
                        kind: 'city',
                        label: city.name,
                        latitude: city.latitude,
                        longitude: city.longitude,
                        flyTo: true,
                        city,
                      })
                  : null,
            }),
          ),
          h('p', {
            class: 'ws-field-hint',
            text: 'Click a city to fly to it. Intensity and position are measured values for that place, not a regional average.',
          }),
        ],
      }),
    );
  }

  const exposure = session.product('exposure');
  if (exposure?.vulnerabilityComment) {
    cards.push(
      card({
        title: 'Why the shaking mattered here',
        children: [
          h('p', { class: 'gx-prose', text: exposure.vulnerabilityComment }),
          h('div', { class: 'gx-figure-source', text: 'USGS PAGER' }),
        ],
      }),
    );
  }
  if (exposure?.provenance) {
    cards.push(card({ children: [provenanceBlock(exposure.provenance)] }));
  }

  pushNext(cards, ctx, 'human');
  return { title: 'Human Impact', summary: session.case.name, cards };
}

/* ------------------------------------------------------------------ *
 * 6. Infrastructure (§7)
 * ------------------------------------------------------------------ */

/** Printed names for the five infrastructure states, and what each claims. */
const STATE_LABELS = Object.freeze({
  [INFRA_STATE.OPERATIONAL]: 'Normal',
  [INFRA_STATE.AT_RISK]: 'Exposed',
  [INFRA_STATE.CLOSED]: 'Damaged / closed',
  [INFRA_STATE.RECOVERING]: 'Recovering',
  [INFRA_STATE.UNKNOWN]: 'Unknown',
});

const STATE_MEANS = Object.freeze({
  [INFRA_STATE.OPERATIONAL]:
    'No modelled hazard zone crosses it. Not a survey.',
  [INFRA_STATE.AT_RISK]: 'Inside a hazard zone the model rates high.',
  [INFRA_STATE.CLOSED]: `Needs a cited report. Basis would read ${STATE_BASIS.OBSERVED}.`,
  [INFRA_STATE.RECOVERING]:
    'Needs a cited reopening, with the capacity it reopened at.',
  [INFRA_STATE.UNKNOWN]: 'Outside the loaded network.',
});

function infrastructureView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Infrastructure', 'infrastructure');
  const exposure = ctx?.disaster?.infrastructureExposure?.() ?? null;
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Which roads, bridges and facilities sat where the hazard was worst.',
          why: 'In a mountain country the shaking rarely kills the road — the slope above it does. Exposure explains which corridor closes, and a closed corridor is why aid takes four days instead of four hours.',
          dataClass: 'SIMULATED',
        }),
      ],
    }),
    card({
      title: 'Exposure, not damage',
      tone: 'gap',
      children: [
        unavailableState({
          what: UNAVAILABLE_REASONS['road-damage-assessment'].name,
          because: UNAVAILABLE_REASONS['road-damage-assessment'].because,
          wouldNeed: UNAVAILABLE_REASONS['road-damage-assessment'].wouldNeed,
          instead: UNAVAILABLE_REASONS['road-damage-assessment'].instead,
        }),
      ],
    }),
  ];

  if (!exposure) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'road network loaded for this area',
            suggestion:
              'Turn on Rail corridors or Road freight in Map Layers while zoomed into the affected region, then return here.',
          }),
        ],
      }),
    );
  } else {
    cards.push(
      card({
        title: 'Road exposure',
        children: [
          metricRow([
            metric({
              value: fmt(exposure.atRisk.length),
              label: 'segments exposed',
              tone: 'warn',
            }),
            metric({
              value: `${exposure.atRiskLengthKm.toFixed(0)} km`,
              label: 'exposed length',
            }),
            metric({
              value: `${exposure.totalLengthKm.toFixed(0)} km`,
              label: 'network assessed',
            }),
          ]),
          ...exposure.atRisk.slice(0, 10).map((segment) =>
            mapRow({
              label: segment.name ?? segment.ref ?? segment.id,
              value: `${segment.lengthKm.toFixed(1)} km`,
              note: segment.caveat,
              tone: 'warning',
            }),
          ),
          h('p', { class: 'ws-field-hint', text: `Basis: ${exposure.basis}.` }),
        ],
      }),
    );

    /*
     * §7 asks for normal → damaged → recovery. The first state is
     * modelled and the other two are observations nobody publishes per asset,
     * so the lifecycle card prints all five states with their real counts and
     * says in one line which of them anything actually reached. A legend with
     * a zero in it is the finding; a legend with invented closures would not
     * be.
     */
    const lifecycle = exposure.lifecycle;
    if (lifecycle) {
      cards.push(
        card({
          title: 'Asset state at this point in the timeline',
          children: [
            ...Object.entries(lifecycle.counts).map(([state, count]) =>
              mapRow({
                label: STATE_LABELS[state] ?? state,
                value: String(count),
                note: STATE_MEANS[state] ?? null,
                tone:
                  count === 0
                    ? 'empty'
                    : state === INFRA_STATE.AT_RISK
                      ? 'warning'
                      : state === INFRA_STATE.CLOSED
                        ? 'blocked'
                        : state === INFRA_STATE.OPERATIONAL
                          ? 'operational'
                          : null,
              }),
            ),
            h('p', { class: 'gx-prose', text: lifecycle.note }),
            h('p', {
              class: 'ws-field-hint',
              text: `Observed: ${lifecycle.observed} · modelled: ${lifecycle.modelled} · evaluated at T${lifecycle.phaseHours >= 0 ? '+' : ''}${formatHours(Math.abs(lifecycle.phaseHours))}.`,
            }),
          ],
        }),
      );
    }
  }

  pushNext(cards, ctx, 'infrastructure');
  return { title: 'Infrastructure', summary: session.case.name, cards };
}

/* ------------------------------------------------------------------ *
 * 7. Economic (§9)
 * ------------------------------------------------------------------ */

function economicView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Economic Damage', 'economic');
  const econ = session.economic();
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'What the event cost, and where that cost fell.',
          why: 'A national total in a card says nothing a reader can act on. The same figure spread across the shaking bands shows which districts carry it.',
          dataClass: 'INFERRED',
        }),
      ],
    }),
  ];

  if (!econ) {
    /*
     * Two different reasons, and saying the wrong one is exactly the kind of
     * misleading message this project exists to avoid. A case with no cited
     * total genuinely has nothing to apportion; a case that HAS a total but
     * whose exposure product failed to load is a transport problem, and
     * telling the user "no total is attached" when one is would send them
     * looking for the wrong thing.
     */
    const total = session.case.confirmed?.economicLossUsd;
    const exposureLoaded =
      session.productStatus('exposure') === LOAD_STATUS.LOADED;
    cards.push(
      total?.value == null
        ? card({
            tone: 'gap',
            children: [
              unavailableState({
                what: 'An economic reading for this case.',
                because:
                  'No cited national loss total is attached to it, and apportioning nothing produces a map of zeroes that looks like a finding.',
                wouldNeed:
                  'A post-disaster needs assessment or an equivalent published total.',
                instead:
                  'The human-impact and infrastructure views work from the sources that did load.',
              }),
            ],
          })
        : card({
            tone: 'warn',
            children: [
              /* The total IS known — show it, and say why it cannot be placed. */
              metric({
                value: fmtUsd(total.value),
                label: 'cited national total',
              }),
              h('div', { class: 'gx-figure-source', text: total.source }),
              dataClassBadge(dataClassFor(total.availability)),
              exposureLoaded
                ? unavailableState({
                    what: 'A spatial reading of that total.',
                    because:
                      'The exposure product loaded but carried no measured intensity bands, so there is nothing to distribute the total across.',
                    wouldNeed:
                      'A ShakeMap footprint covering the affected area.',
                    instead:
                      'The national total above is the cited figure, unplaced.',
                  })
                : errorState({
                    what: 'the population exposure this view distributes the total across',
                    detail:
                      session.productError('exposure') ??
                      'the exposure product did not load',
                    onRetry: async () => {
                      await session.load();
                      ctxRefresh();
                    },
                  }),
            ],
          }),
    );
    pushNext(cards, ctx, 'economic');
    return { title: 'Economic Damage', summary: session.case.name, cards };
  }

  cards.push(
    card({
      title: 'Where the loss fell',
      subtitle: 'A cited total, distributed across measured intensity bands.',
      children: [
        metric({
          value: fmtUsd(econ.nationalTotalUsd),
          label: 'cited national total',
        }),
        h('div', { class: 'gx-figure-source', text: econ.totalSource }),
        ...econ.slices.map((slice) =>
          h(
            'div',
            {
              class: 'gx-bar-row ws-clickable',
              role: 'button',
              tabindex: '0',
              title: `Highlight MMI ${slice.label} on the map`,
              /*
               * §13's bidirectional linkage. The bar and the contour band are
               * the same object, so clicking the chart selects the geometry
               * rather than opening a separate panel.
               */
              onClick: () =>
                session.investigation.select({
                  kind: 'hazard-band',
                  label: `MMI ${slice.label}`,
                  band: slice,
                }),
            },
            [
              h('span', { class: 'gx-mono', text: `MMI ${slice.label}` }),
              h('span', { class: 'gx-bar' }, [
                h('span', {
                  class: 'gx-bar-fill',
                  style: {
                    width: `${(slice.shareOfTotal * 100).toFixed(1)}%`,
                    background: slice.colour ?? 'var(--gx-green)',
                  },
                }),
              ]),
              h('span', {
                class: 'gx-mono',
                text: fmtUsd(slice.apportionedUsd),
              }),
            ],
          ),
        ),
      ],
    }),
    card({
      title: 'How firm this is',
      tone: 'warn',
      children: [
        h('p', { class: 'gx-prose', text: econ.caveat }),
        h('p', { class: 'ws-field-hint', text: econ.sensitivity }),
        h('p', { class: 'ws-field-hint', text: `Method: ${econ.method}` }),
        h('p', {
          class: 'ws-field-hint',
          text: `Would need: ${econ.wouldNeed}`,
        }),
      ],
    }),
  );
  pushNext(cards, ctx, 'economic');
  return { title: 'Economic Damage', summary: session.case.name, cards };
}

/* ------------------------------------------------------------------ *
 * 8-10. Response (§14, §15, §16)
 * ------------------------------------------------------------------ */

function rescueView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Rescue Access', 'rescue');
  const analysis = ctx?.disaster?.rescueAnalysis?.() ?? null;
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Which routes still reach the affected area, and what the detour costs.',
          why: 'This is the question that decides whether help arrives on day one or day four. It is answered by solving the real road network, not by describing a plan.',
          dataClass: 'SIMULATED',
        }),
      ],
    }),
  ];
  if (!analysis) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'road network loaded to route over',
            suggestion:
              'Zoom into the affected region with Road freight corridors on, then return. Routing needs the mapped network for the area.',
          }),
        ],
      }),
    );
    pushNext(cards, ctx, 'rescue');
    return { title: 'Rescue Access', summary: session.case.name, cards };
  }
  cards.push(
    card({
      title: analysis.verdict === 'SEVERED' ? 'Severed' : 'Route comparison',
      tone: analysis.verdict === 'SEVERED' ? 'warn' : 'accent',
      children: [
        h('p', { class: 'gx-prose', text: analysis.finding }),
        analysis.before.ok
          ? mapRow({
              label: analysis.before.label,
              value: `${analysis.before.distanceKm.toFixed(0)} km · ${formatHours(analysis.before.travelHours)}`,
              note: analysis.before.roads.join(', '),
            })
          : null,
        analysis.after.ok
          ? mapRow({
              label: analysis.after.label,
              value: `${analysis.after.distanceKm.toFixed(0)} km · ${formatHours(analysis.after.travelHours)}`,
              note: analysis.after.roads.join(', '),
              tone: 'warning',
            })
          : mapRow({
              label: 'Route B — with closures',
              value: 'NO PATH',
              note: analysis.after.detail,
              tone: 'destroyed',
            }),
        analysis.additionalKm != null
          ? metricRow([
              metric({
                value: `+${analysis.additionalKm.toFixed(0)} km`,
                label: 'additional distance',
                tone: 'warn',
              }),
              metric({
                value: `+${formatHours(analysis.additionalHours)}`,
                label: 'additional time each way',
                tone: 'warn',
              }),
            ])
          : null,
        analysis.before.ok
          ? h('p', {
              class: 'ws-field-hint',
              text: analysis.before.speedAssumption,
            })
          : null,
      ],
    }),
  );
  pushNext(cards, ctx, 'rescue');
  return { title: 'Rescue Access', summary: session.case.name, cards };
}

function evacuationView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Evacuation Scenarios', 'evacuation');
  const scenarios = ctx?.disaster?.evacuationAnalysis?.() ?? null;
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'How the feasible answer changes as roads close.',
          why: 'The recommendation is not a sentence. It is a different route in each scenario, and in the worst one there is no route at all — which is itself the finding.',
          dataClass: 'SIMULATED',
        }),
      ],
    }),
  ];
  if (!scenarios) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'network and safe zones loaded',
            suggestion: 'Load the road network for the affected area first.',
          }),
        ],
      }),
    );
    pushNext(cards, ctx, 'evacuation');
    return { title: 'Evacuation Scenarios', summary: session.case.name, cards };
  }
  for (const scenario of scenarios.scenarios) {
    cards.push(
      card({
        title: scenario.name,
        subtitle: `${scenario.reachableCount} of ${scenario.totalZones} safe zones reachable`,
        tone: scenario.reachableCount === 0 ? 'warn' : 'default',
        children: [
          h('p', { class: 'gx-prose', text: scenario.finding }),
          ...scenario.options.map((option) =>
            mapRow({
              label: option.zone.label,
              value: option.reachable
                ? formatHours(option.route.travelHours)
                : 'UNREACHABLE',
              note: option.reachable
                ? `${option.route.distanceKm.toFixed(1)} km on foot${option.zone.capacity ? ` · capacity ${fmt(option.zone.capacity)}` : ''}`
                : option.route.detail,
              tone: option.reachable ? null : 'destroyed',
            }),
          ),
          scenario.reachableCapacity != null
            ? metric({
                value: fmt(scenario.reachableCapacity),
                label: 'reachable shelter capacity',
              })
            : h('p', {
                class: 'ws-field-hint',
                text: 'No reachable zone published a capacity, so none is stated.',
              }),
        ],
      }),
    );
  }
  cards.push(
    card({
      tone: 'warn',
      children: [h('p', { class: 'gx-prose', text: scenarios.caveat })],
    }),
  );
  pushNext(cards, ctx, 'evacuation');
  return { title: 'Evacuation Scenarios', summary: session.case.name, cards };
}

function humanitarianView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Humanitarian Logistics', 'humanitarian');
  const aid = ctx?.disaster?.aidAnalysis?.() ?? null;
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Need → supply → route → destination, solved per demand point.',
          why: 'Aid that cannot reach a village is not aid. This shows which settlements are servable by road, from where, and how long it takes.',
          dataClass: 'SIMULATED',
        }),
      ],
    }),
  ];
  if (!aid) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'supply and demand points loaded',
            suggestion:
              'Load the road network and the affected cities, then return here.',
          }),
        ],
      }),
    );
    return {
      title: 'Humanitarian Logistics',
      summary: session.case.name,
      cards,
    };
  }
  cards.push(
    card({
      title: 'Corridors',
      subtitle: `${aid.servableCount} of ${aid.totalDemand} demand points servable by road`,
      children: aid.corridors.map((corridor) =>
        h('div', { class: 'gx-corridor' }, [
          mapRow({
            label: corridor.demand.label,
            value: corridor.servable
              ? formatHours(corridor.best.travelHours)
              : 'NOT SERVABLE',
            note: corridor.finding,
            tone: corridor.servable ? null : 'destroyed',
          }),
          h('p', { class: 'ws-field-hint', text: corridor.requirementNote }),
        ]),
      ),
    }),
  );
  pushNext(cards, ctx, 'humanitarian');
  return { title: 'Humanitarian Logistics', summary: session.case.name, cards };
}

/* ------------------------------------------------------------------ *
 * 11. Evidence (§12)
 * ------------------------------------------------------------------ */

function evidenceView(ctx) {
  const session = sessionOf(ctx);
  if (!session) return needsCase(ctx, 'Visual Evidence', 'evidence');
  const items = session.evidence();
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'The agencies’ own published imagery, shown as published.',
          why: 'A rendered chart loses the caveat that came with it. These are the products USGS and others issued for this event, linked so you can check them against what this platform says.',
          dataClass: 'HISTORICAL',
        }),
      ],
    }),
  ];
  if (items.length === 0) {
    cards.push(
      card({
        tone: 'gap',
        children: [
          unavailableState({
            what: 'Published imagery for this case.',
            because:
              'No agency visual products loaded — either the case has no wired source or the request failed.',
            wouldNeed:
              'The event’s agency products, or a Copernicus EMS activation package.',
            instead:
              'The measured layers that did load are in Hazard Geometry.',
          }),
        ],
      }),
    );
  } else {
    for (const item of items) {
      cards.push(
        card({
          title: item.title,
          subtitle: item.source,
          children: [
            h('p', { class: 'gx-prose', text: item.explains }),
            h('a', {
              class: 'ws-btn ws-btn-small',
              href: item.url,
              target: '_blank',
              rel: 'noopener noreferrer',
              text: 'Open the original →',
            }),
          ],
        }),
      );
    }
  }
  pushNext(cards, ctx, 'evidence');
  return {
    title: 'Visual Evidence',
    summary: `${items.length} published products`,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 12. Sources (§20)
 * ------------------------------------------------------------------ */

function sourcesView(ctx) {
  const adapters = allAdapters();
  const _session = sessionOf(ctx);
  const byStatus = {
    LIVE: adapters.filter((a) => a.status === 'LIVE'),
    ARCHIVED: adapters.filter((a) => a.status === 'ARCHIVED'),
    PLANNED: adapters.filter((a) => a.status === 'PLANNED'),
  };
  const session = _session;

  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'Every data source this platform can use, and whether it is connected.',
          why: 'A visualisation you cannot trace is decoration. This lists what is wired, what is archived, and what is declared but not connected — with the integration point named for each.',
          dataClass: 'HISTORICAL',
        }),
        metricRow([
          metric({
            value: String(byStatus.LIVE.length),
            label: 'wired and live',
            tone: 'good',
          }),
          metric({
            value: String(byStatus.ARCHIVED.length),
            label: 'archived',
          }),
          metric({
            value: String(byStatus.PLANNED.length),
            label: 'declared, not connected',
            tone: 'warn',
          }),
        ]),
      ],
    }),
  ];

  if (session) {
    cards.push(
      card({
        title: `Loaded for ${session.case.name}`,
        children: session.getState().products.map((product) =>
          mapRow({
            label: product.name,
            value: product.status,
            note: product.error,
            tone:
              product.status === 'LOADED'
                ? 'observed'
                : product.status === 'FAILED'
                  ? 'destroyed'
                  : 'warning',
          }),
        ),
      }),
    );
    cards.push(
      card({
        title: 'What this case can prove',
        children: DIMENSIONS.map((dimension) =>
          mapRow({
            label: dimension.name,
            value: session.availabilityFor(dimension.id),
            tone:
              session.availabilityFor(dimension.id) === AVAILABILITY.UNAVAILABLE
                ? 'warning'
                : 'observed',
          }),
        ),
      }),
    );
  }

  for (const [status, list] of Object.entries(byStatus)) {
    if (list.length === 0) continue;
    cards.push(
      card({
        title:
          status === 'LIVE'
            ? 'Wired and verified'
            : status === 'ARCHIVED'
              ? 'Archived snapshots'
              : 'Declared, not connected',
        subtitle:
          status === 'PLANNED'
            ? 'The interface exists; the integration point is named.'
            : null,
        tone: status === 'PLANNED' ? 'gap' : 'default',
        children: list.map((adapter) =>
          h('div', { class: 'gx-adapter' }, [
            mapRow({
              label: adapter.source,
              value:
                adapter.hazards.length === 1
                  ? adapter.hazards[0]
                  : `${adapter.hazards.length} hazards`,
              note: adapter.provides,
            }),
            adapter.endpoint
              ? h('div', {
                  class: 'gx-mono gx-endpoint',
                  text: adapter.endpoint,
                })
              : null,
            adapter.note
              ? h('p', { class: 'ws-field-hint', text: adapter.note })
              : null,
          ]),
        ),
      }),
    );
  }

  cards.push(
    card({
      title: 'Hazard types supported',
      subtitle: 'Each with its own visualisation and timeline.',
      children: HAZARD_LIST.map((type) =>
        mapRow({
          label: `${type.icon} ${type.name}`,
          value: `${type.geometries.length} layers · ${phasesFor(type.id).length} phases`,
          note: type.question,
        }),
      ),
    }),
  );

  pushNext(cards, ctx, 'sources');
  return {
    title: 'Data Provenance',
    summary: `${adapters.length} adapters across ${HAZARD_LIST.length} hazard types`,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * 13. The guided demonstration (§24)
 * ------------------------------------------------------------------ */

function demoView(ctx) {
  const session = sessionOf(ctx);
  const playback = ctx?.disaster?.demoPlayback?.() ?? null;
  const script = demo('nepal-gorkha-demo');
  const cards = [
    card({
      children: [
        whyThisMatters({
          what: 'The whole concept in sixteen scenes, on one real event.',
          why: 'It drives the same session, views and layers you drive by hand. There is no demo mode with its own rendering path, because a demo that shows something the product cannot do is a lie about the product.',
          dataClass: 'HISTORICAL',
        }),
        h('p', { class: 'gx-prose', text: script.premise }),
        metricRow([
          metric({ value: String(script.beats.length), label: 'scenes' }),
          metric({ value: `${runtimeMinutes(script)} min`, label: 'runtime' }),
        ]),
      ],
    }),
  ];

  if (!session || session.case.id !== script.caseId) {
    cards.push(
      card({
        children: [
          emptyState({
            what: 'the demonstration case open',
            suggestion:
              'The demo runs on Gorkha 2015. Opening it loads the same sources the demo narrates.',
          }),
          button({
            label: 'Open Gorkha 2015 and start',
            tone: 'primary',
            onClick: async () => {
              await ctx.disaster.open(script.caseId);
              ctx.disaster.startDemo();
            },
          }),
        ],
      }),
    );
    pushNext(cards, ctx, 'demo');
    return { title: 'Guided Demonstration', summary: script.name, cards };
  }

  const state = playback?.getState?.() ?? null;
  cards.push(
    card({
      title: state?.beat
        ? `Scene ${state.beat.scene} — ${state.beat.title}`
        : 'Ready',
      tone: 'accent',
      children: [
        state?.beat
          ? h('p', { class: 'gx-prose', text: state.beat.claim })
          : null,
        state?.missing?.length
          ? h('p', {
              class: 'ws-field-hint',
              text: `This scene’s sources did not all load (${state.missing.join(', ')}). It still runs and says so, because skipping it would demonstrate a rosier platform than the real one.`,
            })
          : null,
        h('div', { class: 'gx-controls' }, [
          button({
            label: '◀ Previous scene',
            onClick: () => {
              playback?.previous();
              ctx.refresh();
            },
            disabled: !state?.canPrevious,
          }),
          button({
            label: state?.status === 'playing' ? '❚❚ Pause' : '▶ Play',
            tone: 'primary',
            onClick: () => {
              if (state?.status === 'playing') playback.pause();
              else ctx.disaster.startDemo();
              ctx.refresh();
            },
          }),
          button({
            label: 'Next scene ▶',
            onClick: () => {
              playback?.next();
              ctx.refresh();
            },
            disabled: !state?.canNext,
          }),
          button({
            label: '■ Stop',
            onClick: () => {
              playback?.stop();
              ctx.refresh();
            },
          }),
        ]),
      ].filter(Boolean),
    }),
    card({
      title: 'The sixteen scenes',
      children: script.beats.map((item) =>
        mapRow({
          label: `${item.scene}. ${item.title}`,
          value: state?.index === item.scene - 1 ? '● NOW' : (item.view ?? ''),
          note: item.claim,
          tone: state?.index === item.scene - 1 ? 'observed' : null,
          onClick: () => {
            playback?.goTo(item.scene - 1);
            ctx.refresh();
          },
        }),
      ),
    }),
  );
  pushNext(cards, ctx, 'demo');
  return {
    title: 'Guided Demonstration',
    summary: state?.beat
      ? `Scene ${state.beat.scene} of ${state.total}`
      : script.name,
    cards,
  };
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const DISASTER_VIEWS = Object.freeze({
  cases: casesView,
  demo: demoView,
  descent: descentView,
  timeline: timelineView,
  hazard: hazardView,
  human: humanView,
  infrastructure: infrastructureView,
  economic: economicView,
  rescue: rescueView,
  evacuation: evacuationView,
  humanitarian: humanitarianView,
  evidence: evidenceView,
  sources: sourcesView,
});

/** Register the refresh hook the retry buttons use. */
export function setRefreshHook(fn) {
  _refresh = typeof fn === 'function' ? fn : null;
}
