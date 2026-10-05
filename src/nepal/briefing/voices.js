/**
 * The neural narrators the briefing ships, pre-rendered with Kokoro-82M
 * (Apache-2.0 code and weights; see docs/NEPAL_2015_AUDIO_RESEARCH.md).
 * Chosen by the model card's own quality grades, not by name or likeness:
 * none imitates a real person. `grade` is the model card's overall grade
 * (af_heart is graded only on target quality).
 */
export const NARRATION_VOICES = Object.freeze([
  Object.freeze({
    id: 'af_heart',
    label: 'Neural narrator · calm, female',
    accent: 'en-US',
    british: false,
    grade: 'A (target quality)',
    default: true,
  }),
  Object.freeze({
    id: 'bf_emma',
    label: 'Neural narrator · measured, female',
    accent: 'en-GB',
    british: true,
    grade: 'B−',
  }),
  Object.freeze({
    id: 'am_michael',
    label: 'Neural narrator · steady, male',
    accent: 'en-US',
    british: false,
    grade: 'C+',
  }),
]);

/** Bump when the renderer's output changes (trim, loudness, encoder): every clip re-renders. */
export const RENDER_VERSION = 'k1';

export const PREVIEW_LINE =
  'Magnitude seven point eight. Only eight point two kilometres deep.';
