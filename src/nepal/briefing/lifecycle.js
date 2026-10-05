/**
 * The visual lifecycle, computed from the timeline: what is on screen at the
 * end of every beat of a run, and of what kind.
 *
 * Every object follows one of four policies:
 *
 *   PERSIST  kept across scenes because the next scene builds on it (the
 *            outline, the mask, a kept layer) — named in the scene's `keep`.
 *   FADE     cleared when its scene ends: the default for everything a scene
 *            draws, and for anything a later beat removes explicitly.
 *   REPLACE  drawn again under the same id: the new one takes its place.
 *   CLEAR    `until: 'beat'` — gone when the next beat starts.
 *
 * The director applies them (CONTEXT → FOCUS → RESULT → CLEANUP →
 * TRANSITION); this module replays a run's actions without a browser so the
 * policies can be tested and audited: how many reading panels — cards,
 * callouts, counters, charts — compete at once, and which objects outlive
 * their beat.
 */

/** Objects that ask to be read: more than a few at once is clutter. */
const PANEL_KINDS = new Set([
  'typed',
  'callout',
  'metric',
  'chart',
  'question',
  'title',
  'clock',
]);

function objectOf(action) {
  switch (action.type) {
    case 'annotation.draw':
      /* The summary's recap lines build one list, read as one panel. */
      if (String(action.className ?? '').includes('brf-typed--recap'))
        return { id: action.id, kind: 'recap' };
      return { id: action.id, kind: action.kind };
    case 'metric.count':
      return { id: action.id, kind: 'metric' };
    case 'chart.enter':
      return { id: action.id, kind: 'chart' };
    case 'question.show':
      return { id: action.id ?? 'question', kind: 'question' };
    case 'title.type':
      return { id: action.id ?? 'title', kind: 'title' };
    case 'time.card':
      return { id: action.id ?? 'timecard', kind: 'clock' };
    case 'layer.show':
      return { id: action.id ?? action.layer, kind: 'layer' };
    case 'route.trace':
      return { id: action.id, kind: 'route' };
    default:
      return null;
  }
}

function removedBy(action) {
  if (action.type === 'annotation.remove' || action.type === 'chart.exit')
    return action.id;
  if (action.type === 'layer.hide') return action.id ?? action.layer;
  return null;
}

/**
 * Replays a planned run. For each entry: the objects live at the end of the
 * beat ({id, kind, policy, from}), and the reading panels among them.
 */
export function lifecycle(plan) {
  const live = new Map();
  let scene = null;
  let staged = -1;
  const out = [];
  for (const entry of plan) {
    if (entry.scene !== scene) {
      const keep = new Set(entry.scene.keep ?? []);
      for (const id of [...live.keys()]) if (!keep.has(id)) live.delete(id);
      for (const obj of live.values()) obj.policy = 'PERSIST';
      scene = entry.scene;
      for (const action of entry.scene.setup ?? []) {
        const obj = objectOf(action);
        if (obj?.id && !live.has(obj.id))
          live.set(obj.id, {
            ...obj,
            policy: 'FADE',
            from: `${entry.scene.id}:setup`,
          });
      }
      staged = -1;
    }
    for (const [id, obj] of [...live])
      if (obj.policy === 'CLEAR') live.delete(id);
    /* As the director does: beats this run skips are applied, instantly and without their transient parts. */
    for (const beat of entry.priorBeats.slice(staged + 1))
      for (const action of beat.actions)
        if (action.until !== 'beat' && action.persist !== false)
          apply(action, `${entry.scene.id}:${beat.id}`);
    staged = entry.beatIndex;
    for (const action of [...entry.beat.actions].sort(
      (a, b) => (a.at ?? 0) - (b.at ?? 0),
    ))
      apply(action, entry.key);
    const objects = [...live.values()].map((o) => ({ ...o }));
    out.push({
      key: entry.key,
      scene: entry.scene.number,
      objects,
      panels: [
        ...objects.filter((o) => PANEL_KINDS.has(o.kind)),
        ...objects.filter((o) => o.kind === 'recap').slice(0, 1),
      ],
    });
  }
  return out;

  function apply(action, from) {
    const gone = removedBy(action);
    if (gone) live.delete(gone);
    const obj = objectOf(action);
    if (!obj?.id) return;
    /* The question card removes itself after its hold: it never outlives its beat. */
    const policy =
      action.until === 'beat' || action.type === 'question.show'
        ? 'CLEAR'
        : live.has(obj.id)
          ? 'REPLACE'
          : 'FADE';
    live.set(obj.id, { ...obj, policy, from });
  }
}
