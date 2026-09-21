/**
 * The validation-check list, in one shape across every analysis stage.
 *
 * Stage 5 already built its checks as an array of named pass/fail rows. Stage 3
 * and Stage 4 expressed the same information differently — named boolean fields
 * plus a list of failure strings — which is perfectly correct and completely
 * uncountable: there is no way to ask "how many checks passed" across all five
 * artefacts without knowing which stage wrote each one.
 *
 * That matters because the interface wants to state it. A header reading
 * "CHECKS 26/26" that silently means "Stage 5 only" is the kind of true-sounding
 * figure this project exists to avoid, so the shape is unified here instead and
 * the older stages emit the array as well.
 *
 * NOTHING IS REMOVED. The named booleans and the failure strings stay exactly
 * where they were; `checks` is added beside them. An artefact consumer written
 * against the old shape keeps working.
 */

/**
 * Build a check list from named conditions.
 *
 * @param {Array<{name:string, passed:boolean, detail?:string}>} rows
 * @returns {{checks:Array<object>, passed:boolean, failures:string[]}}
 *
 * A row with no name is refused rather than numbered. "Check 3 failed" tells a
 * reader nothing, and a check nobody can name has not been thought about.
 */
export function createCheckList(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError(
      'A validation block needs at least one named check. An analysis with no checks has not been validated.',
    );
  }
  const checks = rows.map((row, index) => {
    const name = String(row?.name ?? '').trim();
    if (!name) {
      throw new TypeError(
        `Validation check at position ${index} has no name. A check nobody can name has not been thought about.`,
      );
    }
    return Object.freeze({
      name,
      passed: row.passed === true,
      detail: row.detail === undefined ? null : String(row.detail),
    });
  });
  const failures = checks
    .filter((check) => !check.passed)
    .map((check) =>
      check.detail ? `${check.name}: ${check.detail}` : check.name,
    );
  return Object.freeze({
    checks: Object.freeze(checks),
    passed: failures.length === 0,
    failures: Object.freeze(failures),
  });
}

/**
 * Count checks across several artefacts, for the header that states it.
 *
 * Artefacts written before `checks` existed report as `countable: false` rather
 * than as zero, because "no checks" and "checks in a shape I cannot read" are
 * different facts and only one of them is alarming.
 */
export function summariseChecks(artefacts) {
  let passed = 0;
  let total = 0;
  const countable = [];
  const uncountable = [];
  for (const artefact of artefacts ?? []) {
    const rows = artefact?.validation?.checks;
    if (!Array.isArray(rows)) {
      uncountable.push(artefact?.stage ?? null);
      continue;
    }
    countable.push(artefact?.stage ?? null);
    total += rows.length;
    passed += rows.filter((row) => row.passed).length;
  }
  return Object.freeze({
    passed,
    total,
    allCountable: uncountable.length === 0,
    countableStages: Object.freeze(countable),
    uncountableStages: Object.freeze(uncountable),
    label:
      uncountable.length === 0 ? `${passed}/${total}` : `${passed}/${total}*`,
  });
}
