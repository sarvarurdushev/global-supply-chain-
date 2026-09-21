/**
 * Resolving district names between sources that spell them differently.
 *
 * Nepal's district names are transliterations from Devanagari, and every
 * source made its own choices: OCHA writes "Chitawan", OpenStreetMap writes
 * "Chitwan"; OCHA "Kapilbastu", OSM "Kapilvastu"; OCHA "Terhathum", OSM
 * "Tehrathum". These are the same districts. A join that misses them loses
 * eleven of sixty-six districts — seventeen per cent of the country's
 * earthquake statistics — and the remaining sums still look reasonable, which
 * is what makes it dangerous.
 *
 * The rule here is deliberately conservative. An alias is accepted only when
 * the edit distance is small AND the nearest match is unambiguous: if two
 * candidates are equally close, nothing is decided, because a wrong district
 * join is worse than a missing one. Everything accepted carries its distance
 * so a reader can audit the decision; everything refused is reported with the
 * reason.
 */

/** Levenshtein distance, iterative with a single row of state. */
export function editDistance(a, b) {
  const s = String(a ?? '');
  const t = String(b ?? '');
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const substitution = previous[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current;
  }
  return previous[t.length];
}

/**
 * Match one name against a set of canonical keys.
 *
 * @param {string} key the normalised name to resolve
 * @param {string[]} canonical the normalised keys to match against
 * @param {object} [options]
 * @param {number} [options.maxDistance] how far a transliteration may differ
 * @returns {{matched: string|null, distance: number|null, reason: string}}
 */
export function resolveName(key, canonical, { maxDistance = 2 } = {}) {
  if (!key) return { matched: null, distance: null, reason: 'empty name' };
  if (canonical.includes(key)) {
    return { matched: key, distance: 0, reason: 'exact match' };
  }
  const scored = canonical
    .map((candidate) => ({ candidate, distance: editDistance(key, candidate) }))
    .sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  if (!best || best.distance > maxDistance) {
    return {
      matched: null,
      distance: best?.distance ?? null,
      reason: `nearest candidate "${best?.candidate}" is ${best?.distance} edits away, beyond the ${maxDistance}-edit limit`,
    };
  }
  const tied = scored.filter((item) => item.distance === best.distance);
  if (tied.length > 1) {
    return {
      matched: null,
      distance: best.distance,
      reason: `ambiguous: ${tied.map((t) => t.candidate).join(', ')} are all ${best.distance} edits away`,
    };
  }
  /*
   * A short name can reach an unrelated one in two edits. Requiring the
   * distance to be a small fraction of the name's length stops "Bara"
   * becoming "Bajra" and keeps the rule honest on long names, where two
   * edits really is a transliteration difference.
   */
  const ratio = best.distance / Math.max(key.length, best.candidate.length);
  if (ratio > 0.25) {
    return {
      matched: null,
      distance: best.distance,
      reason: `"${best.candidate}" is ${best.distance} edits from a ${key.length}-character name, too large a share to be a transliteration difference`,
    };
  }
  return {
    matched: best.candidate,
    distance: best.distance,
    reason: `transliteration difference, ${best.distance} edit(s), unambiguous`,
  };
}
