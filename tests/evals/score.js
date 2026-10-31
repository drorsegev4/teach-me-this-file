// Pure scoring for the check.md eval. No model calls here, so it is unit-tested.

const isError = label => label.startsWith('error');

// rows: [{ id, expected, mustNeverFail, actual: [label, label, ...] }]
// Normal rows pass only when every run gives the expected label.
// mustNeverFail rows pass when no run gives "understood". A provider error is a failed run,
// because it gives no label to judge.
export function scoreEval(rows, { runs = 3, passRate = 0.9 } = {}) {
  const scored = rows.map(row => {
    const complete = row.actual.length === runs;
    const passed = row.mustNeverFail
      ? complete && row.actual.every(label => label !== 'understood' && !isError(label))
      : complete && row.actual.every(label => label === row.expected);
    return { ...row, passed };
  });
  const passed = scored.filter(row => row.passed).length;
  const guarded = scored.filter(row => row.mustNeverFail);
  const guardViolations = guarded.reduce((count, row) => count + row.actual.filter(label => label === 'understood').length, 0);
  const rate = rows.length ? passed / rows.length : 0;
  return {
    scored,
    passed,
    total: rows.length,
    rate,
    guardedRows: guarded.length,
    guardViolations,
    pass: guardViolations === 0 && rate >= passRate,
  };
}
