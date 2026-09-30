/**
 * The briefing's clock: virtual time that stops when the presenter pauses and
 * runs faster or slower with the speed control.
 *
 * WHY NOT setTimeout. Every animation, counter, typewriter and wait in the
 * briefing reads this clock rather than the wall clock, so PAUSE freezes all
 * of them at once and 1.5× speeds all of them at once — a pause that stopped
 * the timeline but let a counter finish, or a speed change that sped the
 * captions but not the camera, would desynchronise the thing the whole stage
 * exists to synchronise. It is also why the director is testable: a test
 * advances the clock by hand and nothing sleeps.
 *
 * The clock is driven from outside — `advance(realMs)` from a
 * requestAnimationFrame loop in the browser, by hand in tests.
 */

export function createClock({ rate = 1 } = {}) {
  let now = 0;
  let running = false;
  let speed = rate;
  let seq = 0;
  /** @type {Array<{id:number, at:number, fn:Function}>} */
  let timers = [];

  function fire() {
    /* A callback may schedule more timers; loop until nothing is due. */
    for (;;) {
      const due = timers
        .filter((timer) => timer.at <= now)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) return;
      timers = timers.filter((timer) => timer !== due);
      due.fn();
    }
  }

  return {
    /** Virtual milliseconds since the clock was created. */
    now: () => now,
    get running() {
      return running;
    },
    get speed() {
      return speed;
    },
    start() {
      running = true;
    },
    stop() {
      running = false;
    },
    setSpeed(value) {
      if (!(value > 0)) throw new RangeError('speed must be positive');
      speed = value;
    },
    /** Move time forward by `realMs` of wall time, scaled by speed, if running. */
    advance(realMs) {
      if (!running || !(realMs > 0)) return;
      now += realMs * speed;
      fire();
    },
    /** Run `fn` when virtual time reaches `now + delayMs`. Returns a cancel. */
    after(delayMs, fn) {
      const timer = { id: (seq += 1), at: now + Math.max(0, delayMs), fn };
      timers.push(timer);
      if (timer.at <= now && running) fire();
      return () => {
        timers = timers.filter((item) => item !== timer);
      };
    },
    /** A promise that resolves after `delayMs` of virtual time. */
    wait(delayMs) {
      return new Promise((resolve) => {
        this.after(delayMs, resolve);
      });
    },
    /** Drop every pending timer (a jump to another beat). */
    clearTimers() {
      timers = [];
    },
    get pending() {
      return timers.length;
    },
  };
}

/**
 * Tween progress in [0, 1] for an animation that started at `startedAt` and
 * lasts `durationMs`, read from the clock. Duration 0 means "already done".
 */
export function progress(clock, startedAt, durationMs) {
  if (!(durationMs > 0)) return 1;
  return Math.min(1, Math.max(0, (clock.now() - startedAt) / durationMs));
}

export const ease = Object.freeze({
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
});
