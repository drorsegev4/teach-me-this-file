// Pure scoring for the check.md eval. No model calls here, so it is unit-tested.

// rows: [{ id, expected, mustNeverFail, actual: [label, label, ...] }]
export function scoreEval(rows, { runs = 3, passRate = 0.9 } = {}) {
  const scored = rows.map(row => ({
    ...row,
    passed: row.actual.length === runs && row.actual.every(label => label === row.expected),
  }));
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
