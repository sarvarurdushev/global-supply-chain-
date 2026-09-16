/**
 * Workspace UI primitives.
 *
 * Small, boring, and shared — because the failure of the previous panel was not
 * that any one piece was wrong, it was that each section invented its own
 * layout, its own scroll container and its own way of saying "nothing here".
 * Five sections, five scrollbars, five different empty states.
 *
 * So this module owns four things and every view uses them:
 *
 *   CARD        the only container. Cards stack in ONE scroll, never nested.
 *   STATE       loading / error / empty / unavailable, with a retry that works.
 *   WHY         the "why am I seeing this?" block, mandatory on a data view.
 *   TERM        a glossary word the reader can hover instead of leaving.
 *
 * The hard rule this file exists to enforce: a card never scrolls. If content
 * does not fit, the card collapses or the content is summarised — it does not
 * grow a scrollbar inside a scrollbar. `card()` has no overflow property and
 * the stylesheet does not give it one.
 *
 * DOM-only. No Cesium, no supply-chain imports, so the whole vocabulary can be
 * reasoned about on its own.
 */

import { glossary, dataClassPresentation } from './taxonomy.js';

/* ------------------------------------------------------------------ *
 * Element helper
 * ------------------------------------------------------------------ */

/**
 * Build an element.
 *
 * `children` accepts nodes, strings, arrays and null, so a caller can inline a
 * conditional without assembling an array first.
 *
 * @param {string} tag
 * @param {object} [attrs] `class`, `text`, `html` (trusted, from this module
 *   only), `onClick`, `dataset`, or any attribute name
 * @param {*} [children]
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, children = null) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object')
      Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

/** Append anything appendable, flattening arrays and skipping empties. */
export function append(parent, children) {
  if (children === null || children === undefined || children === false)
    return parent;
  if (Array.isArray(children)) {
    for (const child of children) append(parent, child);
    return parent;
  }
  parent.appendChild(
    children instanceof Node
      ? children
      : document.createTextNode(String(children)),
  );
  return parent;
}

/* ------------------------------------------------------------------ *
 * Card — the only container
 * ------------------------------------------------------------------ */

/**
 * A titled card.
 *
 * Cards are the unit of the workspace. They stack vertically inside the one
 * scroll region the panel owns, and they never scroll themselves.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} [input.subtitle]
 * @param {string} [input.tone] 'default' | 'accent' | 'warn' | 'gap'
 * @param {boolean} [input.collapsible]
 * @param {boolean} [input.startCollapsed]
 * @param {*} [input.actions] nodes for the card header's right side
 * @param {*} [input.children]
 * @returns {HTMLElement}
 */
export function card({
  title,
  subtitle = null,
  tone = 'default',
  collapsible = false,
  startCollapsed = false,
  actions = null,
  children = null,
} = {}) {
  const body = h('div', { class: 'ws-card-body' }, children);
  const node = h('section', { class: `ws-card ws-card-${tone}` });

  if (title) {
    const heading = h('h3', { class: 'ws-card-title', text: title });
    const head = h('header', { class: 'ws-card-head' }, [
      h('div', { class: 'ws-card-head-text' }, [
        heading,
        subtitle ? h('p', { class: 'ws-card-subtitle', text: subtitle }) : null,
      ]),
      actions ? h('div', { class: 'ws-card-actions' }, actions) : null,
    ]);
    if (collapsible) {
      // Progressive disclosure (requirement 25): a card the user has not asked
      // for should take one line, not a screenful.
      head.classList.add('ws-card-head-toggle');
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      const setOpen = (open) => {
        node.classList.toggle('ws-collapsed', !open);
        head.setAttribute('aria-expanded', String(open));
      };
      const toggle = () => setOpen(node.classList.contains('ws-collapsed'));
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
      head.appendChild(h('span', { class: 'ws-card-chevron', text: '⌄' }));
      setOpen(!startCollapsed);
    }
    node.appendChild(head);
  }
  node.appendChild(body);
  node.__body = body;
  return node;
}

/** Replace a card's body content in place. */
export function setCardBody(cardNode, children) {
  const body = cardNode.__body ?? cardNode;
  body.replaceChildren();
  append(body, children);
  return cardNode;
}

/* ------------------------------------------------------------------ *
 * Why am I seeing this?
 * ------------------------------------------------------------------ */

/**
 * The block that answers the question the old interface never did.
 *
 * Required on any view that renders data. Two sentences at most: what this is,
 * and why it is worth looking at. If a view cannot fill this in, that is a
 * signal the view does not have a point, not a signal to skip the block.
 *
 * @param {object} input
 * @param {string} input.what   "These arcs are..."
 * @param {string} input.why    "...because..."
 * @param {string} [input.dataClass]
 * @returns {HTMLElement}
 */
export function whyThisMatters({ what, why, dataClass = null }) {
  return h('aside', { class: 'ws-why' }, [
    h('div', { class: 'ws-why-label', text: 'WHY THIS MATTERS' }),
    h('p', { class: 'ws-why-what', text: what }),
    why ? h('p', { class: 'ws-why-why', text: why }) : null,
    dataClass ? dataClassBadge(dataClass) : null,
  ]);
}

/**
 * A data-class badge with its plain-English reading attached.
 *
 * The badge is the §23 promise made visible: LIVE, HISTORICAL, INFERRED,
 * SIMULATED and UNAVAILABLE never share a colour and never appear without a
 * tooltip saying what the word means.
 */
export function dataClassBadge(dataClass) {
  const presentation = dataClassPresentation(dataClass);
  return h(
    'span',
    {
      class: 'ws-class-badge',
      style: { '--badge': presentation.colour },
      title: `${presentation.label} — ${presentation.means}`,
    },
    [
      h('span', { class: 'ws-class-dot' }),
      h('span', { class: 'ws-class-label', text: presentation.label }),
      h('span', { class: 'ws-class-plain', text: presentation.plain }),
    ],
  );
}

/* ------------------------------------------------------------------ *
 * Glossary terms
 * ------------------------------------------------------------------ */

/**
 * A word the reader can hover for a one-sentence definition.
 *
 * Deliberately inline and underlined rather than a footnote marker: a reader
 * who does not know the word needs the definition at the word, not at the
 * bottom of a panel they have to scroll to.
 *
 * @param {string} term the glossary key
 * @param {string} [label] display text, if it differs from the key
 */
export function term(termKey, label = null) {
  const entry = glossary(termKey);
  const text = label ?? entry?.term ?? termKey;
  if (!entry) return h('span', { text });
  return h('abbr', {
    class: 'ws-term',
    tabindex: '0',
    title: `${entry.term}: ${entry.short}${entry.more ? ` ${entry.more}` : ''}`,
    text,
  });
}

/* ------------------------------------------------------------------ *
 * States: loading / error / empty / unavailable
 * ------------------------------------------------------------------ */

/**
 * "Loading X…", with what is being loaded named.
 *
 * "Loading…" alone is the same as a blank panel: the user still cannot tell
 * whether the app is working or stuck.
 */
export function loadingState(what, { progress = null } = {}) {
  return h('div', { class: 'ws-state ws-state-loading', role: 'status' }, [
    h('div', { class: 'ws-spinner' }),
    h('div', { class: 'ws-state-text' }, [
      h('p', { class: 'ws-state-title', text: `Loading ${what}…` }),
      progress ? h('p', { class: 'ws-state-detail', text: progress }) : null,
    ]),
  ]);
}

/**
 * A failure the user can act on.
 *
 * Three parts, all required: what failed, why as far as we know, and a button
 * that retries. A failure without a retry is a dead end.
 */
export function errorState({
  what,
  detail = null,
  onRetry = null,
  retryLabel = 'Retry',
}) {
  return h('div', { class: 'ws-state ws-state-error', role: 'alert' }, [
    h('div', { class: 'ws-state-icon', text: '⚠' }),
    h('div', { class: 'ws-state-text' }, [
      h('p', { class: 'ws-state-title', text: `Unable to load ${what}.` }),
      detail ? h('p', { class: 'ws-state-detail', text: detail }) : null,
      onRetry
        ? h('button', {
            class: 'ws-btn ws-btn-small',
            type: 'button',
            text: retryLabel,
            onClick: onRetry,
          })
        : null,
    ]),
  ]);
}

/**
 * A successful request that returned nothing.
 *
 * Distinct from an error on purpose: "no vessels in this area" and "the vessel
 * feed is down" are different facts, and collapsing them into one grey box is
 * how a user ends up believing an ocean is empty.
 */
export function emptyState({
  what,
  suggestion = null,
  onAction = null,
  actionLabel = null,
}) {
  return h('div', { class: 'ws-state ws-state-empty' }, [
    h('div', { class: 'ws-state-icon', text: '○' }),
    h('div', { class: 'ws-state-text' }, [
      h('p', {
        class: 'ws-state-title',
        text: `No ${what} for this selection.`,
      }),
      suggestion
        ? h('p', { class: 'ws-state-detail', text: suggestion })
        : null,
      onAction && actionLabel
        ? h('button', {
            class: 'ws-btn ws-btn-small',
            type: 'button',
            text: actionLabel,
            onClick: onAction,
          })
        : null,
    ]),
  ]);
}

/**
 * Data that does not exist, with what would be needed to have it.
 *
 * The most important state in this application. It is visually distinct from an
 * error because it is not a malfunction — nothing is going to fix itself on a
 * retry, and the user deserves to know that rather than clicking hopefully.
 */
export function unavailableState({
  what,
  because,
  wouldNeed = null,
  instead = null,
}) {
  return h('div', { class: 'ws-state ws-state-gap' }, [
    h('div', { class: 'ws-gap-label', text: '○ DATA UNAVAILABLE' }),
    h('p', { class: 'ws-gap-what', text: what }),
    h('p', { class: 'ws-gap-why', text: because }),
    wouldNeed
      ? h('p', { class: 'ws-gap-need' }, [
          h('strong', { text: 'Would need: ' }),
          wouldNeed,
        ])
      : null,
    instead
      ? h('p', { class: 'ws-gap-instead' }, [
          h('strong', { text: 'What you can see instead: ' }),
          instead,
        ])
      : null,
  ]);
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

/** A labelled statistic. */
export function metric({ value, label, hint = null, tone = 'default' }) {
  return h('div', { class: `ws-metric ws-metric-${tone}`, title: hint ?? '' }, [
    h('span', { class: 'ws-metric-value', text: value }),
    h('span', { class: 'ws-metric-label' }, label),
  ]);
}

/** A row of metrics. */
export function metricRow(metrics) {
  return h('div', { class: 'ws-metrics' }, metrics);
}

/** A primary action button. */
export function button({
  label,
  onClick,
  tone = 'default',
  disabled = false,
  title = null,
}) {
  return h('button', {
    class: `ws-btn ws-btn-${tone}`,
    type: 'button',
    text: label,
    disabled,
    title: title ?? '',
    onClick,
  });
}

/** A labelled form control. */
export function field({ label, control, hint = null }) {
  const id = `ws-f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h('div', { class: 'ws-field' }, [
    h('label', { class: 'ws-field-label', for: id }, label),
    control,
    hint ? h('p', { class: 'ws-field-hint', text: hint }) : null,
  ]);
}

/** A select built from [value, label] pairs. */
export function select({ options, value = null, onChange, ariaLabel = null }) {
  const node = h('select', {
    class: 'ws-select',
    'aria-label': ariaLabel ?? '',
    onChange: (event) => onChange(event.target.value),
  });
  for (const [optionValue, optionLabel] of options) {
    node.appendChild(
      h('option', {
        value: optionValue,
        text: optionLabel,
        selected: optionValue === value,
      }),
    );
  }
  if (value !== null) node.value = value;
  return node;
}

/**
 * The "what next" block.
 *
 * Requirement 25 level 4: never leave a user at the end of a view having to
 * invent the next question. Each entry is the question, not the destination.
 */
export function nextStepsBlock(steps, onGo) {
  if (!steps?.length) return null;
  return h('nav', { class: 'ws-next' }, [
    h('div', { class: 'ws-next-label', text: 'WHAT TO INVESTIGATE NEXT' }),
    h(
      'ul',
      { class: 'ws-next-list' },
      steps.map((step) =>
        h('li', {}, [
          h(
            'button',
            {
              class: 'ws-next-item',
              type: 'button',
              onClick: () => onGo(step.item.id),
            },
            [
              h('span', { class: 'ws-next-q', text: step.question }),
              h('span', {
                class: 'ws-next-dest',
                text: `${step.item.icon} ${step.item.name}`,
              }),
            ],
          ),
        ]),
      ),
    ),
  ]);
}

/**
 * A provenance disclosure.
 *
 * Collapsed by default — it is level 3 of the hierarchy, not level 1 — but
 * always present, because a number whose source cannot be checked is a rumour.
 */
export function provenanceBlock(provenance) {
  if (!provenance) return null;
  const rows = [
    ['Source', provenance.source],
    ['Dataset', provenance.dataset],
    ['Method', provenance.method],
    ['Retrieved', provenance.retrievedAt],
    ['Licence', provenance.license],
  ].filter(([, value]) => value);

  const details = h('details', { class: 'ws-prov' }, [
    h('summary', { class: 'ws-prov-summary' }, [
      dataClassBadge(provenance.dataClass),
      h('span', { class: 'ws-prov-source', text: provenance.source ?? '' }),
      h('span', { class: 'ws-prov-hint', text: 'where this came from' }),
    ]),
    h(
      'dl',
      { class: 'ws-prov-body' },
      rows.flatMap(([label, value]) => [
        h('dt', { text: label }),
        h('dd', { text: String(value) }),
      ]),
    ),
  ]);
  if (provenance.limitations?.length) {
    details.appendChild(
      h('div', { class: 'ws-prov-limits' }, [
        h('div', { class: 'ws-prov-limits-label', text: 'Limitations' }),
        h(
          'ul',
          {},
          provenance.limitations.map((limitation) =>
            h('li', { text: limitation }),
          ),
        ),
      ]),
    );
  }
  return details;
}
