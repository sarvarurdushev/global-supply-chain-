/**
 * The executive briefing script, generated from the timeline the product
 * plays and the facts it reads.
 *
 * Nothing here is written by hand: every line of narration, every caption,
 * every camera move and every figure comes from the scene definitions and the
 * artefacts, so the document and the product cannot drift apart. A test
 * regenerates it and compares it with the committed copy.
 *
 * Times are ESTIMATES at 1× with a voice (2.5 words a second) — the director
 * waits for narration and for animations, so the real run is never shorter
 * than this and is longer only where a camera or a voice runs slow.
 */

import { FACTS, fillTemplate } from './facts.js';
import {
  RUNS,
  RUN_LABELS,
  entryLengthMs,
  estimateRun,
  longestStillMs,
  planRun,
} from './timeline.js';

const clock = (ms) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** The fact a template token names: the longest registered id its path starts with. */
function factOfToken(token) {
  const path = token.split('|')[0].trim();
  let best = null;
  for (const id of Object.keys(FACTS)) {
    if (
      (path === id || path.startsWith(`${id}.`)) &&
      (!best || id.length > best.length)
    )
      best = id;
  }
  return best;
}

function factsIn(text) {
  return [...String(text ?? '').matchAll(/\{([^}]+)\}/g)]
    .map((m) => factOfToken(m[1]))
    .filter(Boolean);
}

function placeText(ref) {
  if (!ref) return '';
  if (typeof ref === 'object' && ref.fact)
    return `${ref.fact}${ref.path?.length ? `.${ref.path.join('.')}` : ''}`;
  if (typeof ref === 'object') return `${ref.lon}, ${ref.lat}`;
  return String(ref);
}

function describeAction(action, fill) {
  const at = `+${seconds(action.at ?? 0)}`;
  switch (action.type) {
    case 'camera.fly': {
      const range = action.spanFactor
        ? `${action.spanFactor}× its extent`
        : `${action.rangeKm ?? '—'} km`;
      return [
        'CAMERA',
        `${at} fly to ${placeText(action.to)} · ${range} · pitch ${action.pitch ?? -90}° · heading ${action.heading ?? 0}° · ${seconds(action.duration ?? 3000)}`,
      ];
    }
    case 'layer.show':
      return [
        'MAP',
        `${at} show ${action.id ?? action.layer}${action.categories ? ` (categories ${action.categories.join(', ')})` : ''}`,
      ];
    case 'layer.hide':
      return ['MAP', `${at} hide ${action.id ?? action.layer}`];
    case 'layer.filter':
      return [
        'MAP',
        `${at} filter ${action.id ?? action.layer}${action.classes ? ` → classes ${action.classes.join(', ')}` : ''}${action.highlight !== undefined ? ` → highlight ${action.highlight}` : ''}${action.dim !== undefined ? ` → dim ${action.dim}` : ''}${action.alpha !== undefined ? ` → alpha ${action.alpha}` : ''}`,
      ];
    case 'annotation.draw': {
      const words = [
        action.title,
        action.text,
        ...(action.lines ?? []).map((l) =>
          typeof l === 'string' ? l : l.text,
        ),
      ]
        .filter(Boolean)
        .map(fill)
        .join(' / ');
      return [
        'ANNOTATION',
        `${at} ${action.kind}${action.anchor ? ` @ ${placeText(action.anchor)}` : ''}${words ? ` — ${words}` : ''}`,
      ];
    }
    case 'annotation.remove':
      return ['ANNOTATION', `${at} remove ${action.id}`];
    case 'route.trace':
      return [
        'MAP',
        action.line?.between
          ? `${at} draw ${action.id}, a straight line from ${placeText(action.line.between[0])} to ${placeText(action.line.between[1])}${action.dashed ? ' (dashed)' : ''}`
          : `${at} trace route ${action.id} from ${placeText(action.line)}${action.dashed ? ' (dashed)' : ''}`,
      ];
    case 'metric.count':
      return [
        'ANNOTATION',
        `${at} count ${action.fact}${action.key ? `.${action.key}` : ''}${action.subKey ? `.${action.subKey}` : ''} — ${fill(action.label ?? '')}`,
      ];
    case 'chart.enter':
      return [
        'CHART',
        `${at} enter ${action.chart}${action.title ? ` “${fill(action.title)}”` : ''}`,
      ];
    case 'chart.update':
      return [
        'CHART',
        `${at} ${action.id}: ${action.op}${action.index !== undefined ? ` ${action.index}` : ''}${action.mmi !== undefined ? ` MMI ${action.mmi}` : ''}`,
      ];
    case 'chart.exit':
      return ['CHART', `${at} exit ${action.id}`];
    case 'audio.cue':
      return ['SOUND', `${at} ${action.cue}`];
    case 'question.show':
      return ['ANNOTATION', `${at} question — ${fill(action.text)}`];
    case 'title.type':
      return [
        'ANNOTATION',
        `${at} title — ${(action.lines ?? []).map((l) => fill(typeof l === 'string' ? l : l.text)).join(' / ')}`,
      ];
    case 'veil':
      return ['MAP', `${at} veil ${action.opacity}`];
    default:
      return ['OTHER', `${at} ${action.type}`];
  }
}

/**
 * @param {ReturnType<import('./facts.js').createFactBook>} book
 * @param {Array<object>} scenes
 */
export function renderBriefingScript(book, scenes) {
  const fill = (text) => fillTemplate(String(text ?? ''), book);
  const out = [];
  const plans = Object.fromEntries(
    [RUNS.THREE, RUNS.SIX, RUNS.FULL].map((run) => [run, planRun(scenes, run)]),
  );

  out.push('# Nepal 2015 — Executive Briefing Script');
  out.push('');
  out.push(
    '> **Generated** by `node scripts/generate-briefing-script.mjs` from the scene timeline',
  );
  out.push(
    '> (`src/nepal/briefing/scenes/`) and the analysis artefacts (`data/analysis/`). Do not edit by',
  );
  out.push(
    '> hand: a test regenerates this file and fails if it differs. Every figure below is read from',
  );
  out.push(
    '> an artefact through `src/nepal/briefing/facts.js`; none is typed into a scene.',
  );
  out.push('');
  out.push(
    'Times are estimates at 1× with a voice (2.5 words a second). The director waits for both the',
  );
  out.push(
    'narration and the animations, so a real run is never shorter than this. Without a voice the',
  );
  out.push(
    'caption’s reading time sets the pace instead (3.2 words a second).',
  );
  out.push('');
  out.push('## Runs');
  out.push('');
  out.push(
    '| Run | Scenes | Beats | Voiced | Silent | Longest beat | Longest still stretch |',
  );
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const run of [RUNS.THREE, RUNS.SIX, RUNS.FULL]) {
    const plan = plans[run];
    const voiced = estimateRun(plan);
    const silent = estimateRun(plan, { voiced: false });
    const still = Math.max(
      0,
      ...plan.map((entry) => longestStillMs(entry.beat)),
    );
    out.push(
      `| ${RUN_LABELS[run]} | ${voiced.scenes} | ${voiced.beats} | ${clock(voiced.totalMs)} | ${clock(silent.totalMs)} | ${seconds(voiced.longestBeatMs)} | ${seconds(still)} |`,
    );
  }
  out.push('');

  for (const run of [RUNS.THREE, RUNS.SIX]) {
    out.push(`## ${RUN_LABELS[run]} — running order`);
    out.push('');
    out.push('| Time | Scene | Beat | Caption |');
    out.push('| --- | --- | --- | --- |');
    let t = 0;
    for (const entry of plans[run]) {
      out.push(
        `| ${clock(t)} | ${String(entry.scene.number).padStart(2, '0')} ${entry.scene.title} | ${entry.beat.id} | ${fill(entry.beat.caption).replace(/\|/g, '\\|')} |`,
      );
      t += entryLengthMs(entry);
    }
    out.push('');
  }

  out.push(`## ${RUN_LABELS[RUNS.FULL]} — the full script`);
  out.push('');
  let t = 0;
  let lastScene = null;
  for (const entry of plans[RUNS.FULL]) {
    const { scene, beat } = entry;
    if (scene !== lastScene) {
      lastScene = scene;
      const runs = scene.runs.map((r) => RUN_LABELS[r]).join(' · ');
      out.push(
        `### ${String(scene.number).padStart(2, '0')} · ${scene.title} — Act ${scene.act}`,
      );
      out.push('');
      out.push(`*${scene.question}* — in ${runs}`);
      out.push('');
      const setup = (scene.setup ?? [])
        .map((action) => describeAction(action, fill)[1])
        .join('; ');
      if (setup)
        out.push(
          `- **SETUP** (landed instantly on entry, so a skip arrives in the right state): ${setup}`,
        );
      out.push('');
    }
    const length = entryLengthMs(entry);
    const beatRuns = beat.runs
      .map((r) => RUN_LABELS[r].split(' ')[0])
      .join(' / ');
    out.push(
      `#### ${clock(t)} — ${beat.id} · ${seconds(length)} · ${beatRuns}`,
    );
    out.push('');
    out.push(`- **NARRATION** ${fill(beat.narration)}`);
    out.push(`- **CAPTION** ${fill(beat.caption)}`);
    const groups = {};
    for (const action of beat.actions) {
      const [group, text] = describeAction(action, fill);
      (groups[group] ??= []).push(text);
    }
    for (const group of [
      'CAMERA',
      'MAP',
      'ANNOTATION',
      'CHART',
      'SOUND',
      'OTHER',
    ]) {
      if (groups[group]) out.push(`- **${group}** ${groups[group].join('; ')}`);
    }
    const used = new Set(
      [
        ...factsIn(beat.caption),
        ...factsIn(beat.narration),
        ...beat.actions.flatMap((a) => [
          a.fact,
          a.anchor?.fact,
          a.to?.fact,
          a.line?.fact,
          ...factsIn(a.title),
          ...factsIn(a.label),
          ...factsIn(a.text),
          ...(a.lines ?? []).flatMap((l) =>
            factsIn(typeof l === 'string' ? l : l.text),
          ),
        ]),
      ].filter(Boolean),
    );
    const evidence = [...used].sort().map((id) => {
      const def = FACTS[id];
      return `${id} — ${def.source} · ${def.cls}${def.record ? ` · record \`${def.record}\`` : ''}`;
    });
    const classes = [...new Set([...used].map((id) => FACTS[id].cls))].sort();
    if (evidence.length) out.push(`- **EVIDENCE** ${evidence.join('; ')}`);
    out.push(
      `- **CLASS** ${classes.length ? classes.join(' · ') : 'none (no figure)'}`,
    );
    out.push(`- **LONGEST STILL** ${seconds(longestStillMs(beat))}`);
    out.push('');
    t += length;
  }
  return `${out.join('\n')}\n`;
}
