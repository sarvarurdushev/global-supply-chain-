/**
 * The analysis registry: one structured record per analytical result.
 *
 * §26 and §27 of the brief ask for a presentation-ready description of every
 * module — question, inputs, method, formula, outputs, visualisation,
 * limitations, data class. Writing that by hand after the fact produces prose
 * that drifts from the code. Building it here, beside the calculation, and
 * refusing an incomplete one keeps the two together.
 *
 * `limitations` is required and must be non-empty. An analysis with no stated
 * limitation has not been thought about.
 */

import { DataClass } from '../registry.js';

const REQUIRED = Object.freeze([
  'id',
  'name',
  'question',
  'inputs',
  'method',
  'outputs',
  'visualisation',
  'dataClass',
]);

/**
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.name
 * @param {string} input.question the research question, in one sentence
 * @param {Array<{dataset:string, role:string}>} input.inputs
 * @param {string} input.method what was done, in words
 * @param {string} [input.formula] the algorithm or equation, where there is one
 * @param {string[]} input.outputs the variables produced
 * @param {string} input.visualisation how it reaches the screen
 * @param {string[]} input.limitations what it cannot support
 * @param {string} input.dataClass one of `DataClass`
 * @param {object} [input.parameters] free parameters and their chosen values
 * @param {string} [input.parameterJustification] why those values
 */
export function createAnalysisRecord(input) {
  const missing = REQUIRED.filter((key) => {
    const value = input?.[key];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length > 0) {
    throw new TypeError(
      `Analysis record is incomplete: ${missing.join(', ')}.`,
    );
  }
  if (!Array.isArray(input.limitations) || input.limitations.length === 0) {
    throw new TypeError(
      'An analysis record must state at least one limitation. ' +
        'A result with no stated limitation has not been examined.',
    );
  }
  if (!Object.values(DataClass).includes(input.dataClass)) {
    throw new TypeError(`Unknown dataClass "${input.dataClass}".`);
  }
  /*
   * A free parameter without a justification is an arbitrary choice presented
   * as a finding. If a threshold can move, the record must say why it sits
   * where it does.
   */
  if (
    input.parameters &&
    Object.keys(input.parameters).length > 0 &&
    !input.parameterJustification
  ) {
    throw new TypeError(
      `Analysis "${input.id}" declares parameters ${Object.keys(input.parameters).join(', ')} ` +
        'but no justification for their values.',
    );
  }
  /*
   * `resultClass` separates an observation from a statistic from a fitted
   * model parameter. It defaults to the data class only where the two mean
   * the same thing; an analysis that fits a model must say so explicitly.
   */
  return Object.freeze({
    schemaVersion: 1,
    resultClass: input.resultClass ?? input.dataClass,
    ...input,
    inputs: Object.freeze(
      input.inputs.map((item) => Object.freeze({ ...item })),
    ),
    outputs: Object.freeze([...input.outputs]),
    limitations: Object.freeze([...input.limitations]),
  });
}
