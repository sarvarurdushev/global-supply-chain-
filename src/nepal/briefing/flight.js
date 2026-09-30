/**
 * Camera flights on the briefing clock.
 *
 * A view is what the camera looks AT, not where it sits: a ground target,
 * the distance to it, and the heading and pitch it is seen from. Flying
 * between two views interpolates those, so the subject stays framed through
 * the move and a flight is a pure function of time — PAUSE freezes it
 * mid-move, a speed change applies mid-move, and BACK or NEXT can land it
 * instantly without asking the globe where it got to.
 *
 * Degrees and metres throughout. Pure: no Cesium, no DOM.
 */

import { ease } from './clock.js';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Signed shortest turn from `a` to `b`, in degrees, in [-180, 180). */
export function shortestTurn(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

function groundDistanceM(a, b) {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = φ2 - φ1;
  const dλ = toRad(shortestTurn(a.lon, b.lon));
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far the camera pulls back mid-flight, as a fraction of its range: none
 * for a turn in place, up to `maxLift` for a move across several frames'
 * worth of ground, so a long move rises and settles rather than skimming.
 */
export function flightLift(from, to, maxLift = 0.8) {
  const ground = groundDistanceM(from, to);
  return Math.min(maxLift, (0.5 * ground) / Math.max(from.range, to.range, 1));
}

/**
 * The view at `t` in [0, 1] of the flight from `from` to `to`.
 * @param {{lon:number, lat:number, range:number, heading:number, pitch:number}} from
 * @param {{lon:number, lat:number, range:number, heading:number, pitch:number}} to
 * @param {number} t linear flight progress
 */
export function interpolateView(from, to, t) {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= 0) return { ...from };
  if (clamped >= 1) return { ...to };
  const k = ease.inOut(clamped);
  const lift = flightLift(from, to);
  /* Range in log space, so a zoom feels even across scales. */
  const range =
    Math.exp(
      Math.log(from.range) + (Math.log(to.range) - Math.log(from.range)) * k,
    ) *
    (1 + lift * Math.sin(Math.PI * k));
  return {
    lon: from.lon + shortestTurn(from.lon, to.lon) * k,
    lat: from.lat + (to.lat - from.lat) * k,
    range,
    heading: from.heading + shortestTurn(from.heading, to.heading) * k,
    pitch: from.pitch + (to.pitch - from.pitch) * k,
  };
}
