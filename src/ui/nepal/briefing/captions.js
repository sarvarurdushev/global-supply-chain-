/**
 * The cinematic caption: what the narrator is saying now, in the lower third.
 *
 * One or two lines, revealed word by word on the briefing clock so a paused
 * briefing pauses mid-sentence, and never a paragraph. With CC off the
 * caption is hidden but the story still runs; with the voice off it is the
 * only narration there is.
 */

import { progress } from '../../../nepal/briefing/clock.js';

export function createCaptions({ container, clock }) {
  const node = document.createElement('div');
  node.className = 'brf-caption';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  const inner = document.createElement('div');
  inner.className = 'brf-caption__text';
  node.append(inner);
  container.append(node);

  let words = [];
  let shownAt = 0;
  let enabled = true;
  let frame = null;

  function tick() {
    const perWordMs = 70;
    const t = progress(clock, shownAt, Math.max(1, words.length * perWordMs));
    /* The first word lands with the box, so the box is never shown empty. */
    const count = Math.max(1, Math.ceil(words.length * t));
    inner.textContent = words.slice(0, count).join(' ');
    node.classList.toggle('is-visible', enabled && words.length > 0);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    node,
    /**
     * `instant`: the whole line at once. A beat jumped to while paused is
     * shown whole, and a paused clock would otherwise hold it at one word.
     */
    show(text, { instant = false } = {}) {
      words = text ? String(text).split(/\s+/).filter(Boolean) : [];
      shownAt = instant ? -Infinity : clock.now();
      /* Screen readers get the whole line at once. */
      node.setAttribute('aria-label', text ?? '');
    },
    setEnabled(on) {
      enabled = Boolean(on);
    },
    get enabled() {
      return enabled;
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      node.remove();
    },
  };
}
