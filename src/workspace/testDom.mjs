/**
 * A minimal DOM, enough to render the workspace under Node.
 *
 * WHY NOT jsdom: this repository has no DOM dependency and adding one for a
 * test suite that runs on every commit is a large cost for a small need. The
 * inherited tests hand-roll `globalThis.document` stubs for the same reason
 * (see `src/overlays/worldOverlay.test.mjs`), so this follows the house style
 * and just does it once, properly, in a shared place.
 *
 * WHAT IT SUPPORTS: element creation, text, classes, attributes, dataset,
 * inline style, children, `replaceChildren`, event listeners with `click()`,
 * and a `querySelectorAll` that understands tag, `.class` and `#id` selectors.
 * That is the whole surface `components.js` and `views.js` use.
 *
 * WHAT IT DOES NOT SUPPORT: layout, computed style, CSS cascade, or anything
 * that depends on a real renderer. So it can prove that a view builds without
 * throwing and that the right text and structure came out — which is what a
 * blank panel is a failure of — and it cannot prove anything about appearance.
 * Appearance is verified by driving the real browser.
 */

class ClassList {
  constructor(node) {
    this._node = node;
  }
  get _set() {
    return new Set(
      String(this._node.className || '')
        .split(/\s+/)
        .filter(Boolean),
    );
  }
  _write(set) {
    this._node.className = [...set].join(' ');
  }
  add(...names) {
    const set = this._set;
    for (const name of names) set.add(name);
    this._write(set);
  }
  remove(...names) {
    const set = this._set;
    for (const name of names) set.delete(name);
    this._write(set);
  }
  contains(name) {
    return this._set.has(name);
  }
  toggle(name, force) {
    const has = this.contains(name);
    const next = force === undefined ? !has : Boolean(force);
    if (next) this.add(name);
    else this.remove(name);
    return next;
  }
}

/**
 * Shared base so `children instanceof Node` works.
 *
 * `components.js` uses that check to decide whether to append a node or wrap a
 * value in a text node. Without a common base, a TextNode failed the check and
 * got stringified to "[object Object]" — which is exactly the kind of quiet
 * corruption a test DOM is supposed to catch rather than cause.
 */
class DomNode {}

class TextNode extends DomNode {
  constructor(text) {
    super();
    this.nodeType = 3;
    this.textContent = String(text);
    this.children = [];
  }
  get innerText() {
    return this.textContent;
  }
}

class Element extends DomNode {
  constructor(tagName) {
    super();
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.className = '';
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this._text = '';
    this.parentElement = null;
    this.classList = new ClassList(this);
    // `hidden` and `disabled` are read as properties by the shell, so they are
    // real fields rather than attribute lookups.
    this.hidden = false;
    this.disabled = false;
    this.id = '';
    this.value = '';
    this.options = [];
    this.selectedIndex = -1;
  }

  set textContent(value) {
    this._text = String(value ?? '');
    this.children = [];
  }
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((child) => child.textContent).join('');
  }
  /** Approximates innerText well enough to assert on rendered copy. */
  get innerText() {
    return this.textContent;
  }

  appendChild(child) {
    if (child instanceof Element) child.parentElement = this;
    this.children.push(child);
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') {
      this.options.push(child);
      if (child.attributes.get('selected') !== undefined) {
        this.selectedIndex = this.options.length - 1;
        this.value = child.attributes.get('value') ?? '';
      }
    }
    return child;
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this._text = '';
    this.options = [];
    for (const node of nodes) this.appendChild(node);
  }
  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((entry) => entry !== handler),
    );
  }
  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) ?? []) {
      handler(event);
    }
    return true;
  }
  /** Fire the click handlers a test wants to exercise. */
  click() {
    return this.dispatchEvent({
      type: 'click',
      target: this,
      preventDefault() {},
    });
  }

  /** Depth-first walk over element descendants. */
  *walk() {
    for (const child of this.children) {
      if (!(child instanceof Element)) continue;
      yield child;
      yield* child.walk();
    }
  }

  /** Does this element satisfy a single simple selector (`.cls`, `#id`, `tag`)? */
  _matchesSimple(part) {
    if (part === '*') return true;
    if (part.startsWith('.')) return this.classList.contains(part.slice(1));
    if (part.startsWith('#')) return this.id === part.slice(1);
    return this.tagName === part.toUpperCase();
  }

  /**
   * Match a selector, including comma lists and descendant combinators.
   *
   * Descendant support matters: the app uses `.ws-topbar-actions .ws-btn`, and
   * an earlier version of this shim treated the whole string as one simple
   * selector. It matched nothing, and five tests failed for a reason that had
   * nothing to do with the code under test.
   */
  matches(selector) {
    const alternatives = String(selector)
      .trim()
      .split(/\s*,\s*/);
    return alternatives.some((alternative) => {
      const parts = alternative.trim().split(/\s+/);
      if (!this._matchesSimple(parts[parts.length - 1])) return false;
      // Walk up, consuming ancestor parts right to left. Descendant only —
      // `>`, `+` and `~` are not supported and are not used.
      let ancestor = this.parentElement;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        let found = false;
        while (ancestor) {
          if (ancestor._matchesSimple(parts[i])) {
            found = true;
            ancestor = ancestor.parentElement;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (!found) return false;
      }
      return true;
    });
  }
  querySelectorAll(selector) {
    return [...this.walk()].filter((node) => node.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** Create a document object and install it, returning a restore function. */
export function installTestDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    CustomEvent: globalThis.CustomEvent,
    Node: globalThis.Node,
  };

  const body = new Element('body');
  const document = {
    body,
    createElement: (tag) => new Element(tag),
    createElementNS: (_ns, tag) => new Element(tag),
    createTextNode: (text) => new TextNode(text),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    querySelector: (selector) => body.querySelector(selector),
    getElementById: (id) => body.querySelector(`#${id}`),
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
  };

  const windowListeners = new Map();
  const windowStub = {
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = windowListeners.get(type);
      if (!list) return;
      windowListeners.set(
        type,
        list.filter((entry) => entry !== handler),
      );
    },
    dispatchEvent(event) {
      for (const handler of windowListeners.get(event.type) ?? [])
        handler(event);
      return true;
    },
  };

  globalThis.document = document;
  globalThis.window = windowStub;
  globalThis.Node = DomNode;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail ?? null;
    }
  };

  return {
    document,
    window: windowStub,
    body,
    /** Text of everything rendered, for copy assertions. */
    text: () => body.textContent,
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.CustomEvent = previous.CustomEvent;
      globalThis.Node = previous.Node;
    },
  };
}

export { DomNode, Element, TextNode };
