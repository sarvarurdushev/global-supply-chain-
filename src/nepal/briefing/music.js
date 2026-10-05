/**
 * The score's dramaturgy: which musical state each scene sits in, and which
 * moments earn a musical cue. Pure data, shared by the score (browser), the
 * scene tests and the audio documentation.
 *
 * STATES follow the acts, so the music changes when the story changes act
 * and never between two beats of the same act: NEXT and BACK inside an act
 * leave it playing. Two scenes carry their own state because the story turns
 * there — the main shock (scenes 04–08) and the coverage gap (scene 20).
 *
 * CUES are reserved for six moments, and only these: the main shock, the
 * M7.3 second shock, the first damage reveal, the coverage-gap reveal, the
 * rescue disconnect and the executive close. Everything else is the bed.
 * Short accents that belong to the picture (a lock-on, a reveal tick) are
 * sound effects, not music, and live in the SFX bus.
 */

export const MUSIC_STATES = Object.freeze([
  'incident',
  'mainshock',
  'exposure',
  'damage',
  'gap',
  'network',
  'access',
  'summary',
]);

/** The six musical cues the briefing may play, and what each marks. */
export const MUSIC_CUES = Object.freeze({
  impact: 'The main shock: magnitude 7.8.',
  aftershock: 'The second major shock: magnitude 7.3, seventeen days later.',
  damage: 'The first damage evidence: what the satellites saw.',
  gap: 'The coverage gap: where the record is silent.',
  disconnect: 'The rescue disconnect: the road that no longer reaches.',
  close: 'The executive close.',
});

const BY_ACT = Object.freeze({
  I: 'incident',
  II: 'exposure',
  III: 'damage',
  IV: 'network',
  V: 'access',
  VI: 'summary',
});

/** The state a scene plays in: its own `music`, else its act's. */
export function musicStateFor(scene) {
  if (scene?.music && MUSIC_STATES.includes(scene.music)) return scene.music;
  return BY_ACT[scene?.act] ?? null;
}
