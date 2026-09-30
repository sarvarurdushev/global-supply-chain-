import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptions } from './captions.js';

/* Just enough document for the caption box: elements with a class list. */
function fakeElement() {
  const classes = new Set();
  return {
    className: '',
    textContent: '',
    classList: {
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    setAttribute() {},
    append() {},
    remove() {},
  };
}

test('CC off hides the caption at once, not on the next drawn frame', () => {
  globalThis.document = { createElement: fakeElement };
  /* Frames never come: whatever changes must change without one. */
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const clock = { now: () => 0 };
  const captions = createCaptions({ container: fakeElement(), clock });
  captions.show('MAGNITUDE 7.8', { instant: true });
  captions.setEnabled(true);
  assert.equal(captions.node.classList.contains('is-visible'), true);
  captions.setEnabled(false);
  assert.equal(captions.node.classList.contains('is-visible'), false);
  captions.setEnabled(true);
  assert.equal(captions.node.classList.contains('is-visible'), true);
  captions.destroy();
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});
