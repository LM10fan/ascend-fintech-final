import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCENARIO as base,
  POLICY,
  simulate,
  loanTerms,
  exploreSchedule,
  validateScenario,
  compareStipendTiming,
} from "../src/features/ascend/domain/cashflow.js";

test("Day 5 versus Day 20 isolates timing, preserving totals and affordability", () => {
  for (const months of [1, 3]) {
    for (const shock of [0, 600]) {
      const input = { ...base, stipendDay: 12, shock };
      const { day5, day20 } = compareStipendTiming(input, { months });
      assert.deepEqual(input, { ...base, stipendDay: 12, shock });
      assert.equal(day5.recurringMargin, 530);
      assert.equal(day20.recurringMargin, 530);
      assert.equal(day5.closingBalance, day20.closingBalance);
      assert.equal(day5.lowestBalance, 1100 - shock);
      assert.equal(day20.lowestBalance, -2470 - shock);
      for (const result of [day5, day20]) {
        assert.equal(result.horizon, months * 30);
        assert.equal(
          result.ledger.filter((row) => row.kind === "shock").length,
          shock > 0 ? 1 : 0,
        );
        assert.equal(result.closingBalance, 3000 + 530 * months - shock);
      }
    }
  }
});
test("shock off/on/off is stateless and never becomes a recurring expense", () => {
  for (const stipendDay of [5, 20]) {
    const without = simulate({ ...base, stipendDay }, { months: 3 });
    const withShock = simulate(
      { ...base, stipendDay, shock: 600 },
      { months: 3 },
    );
    const removed = simulate({ ...base, stipendDay, shock: 0 }, { months: 3 });
    assert.deepEqual(removed, without);
    assert.equal(without.closingBalance - withShock.closingBalance, 600);
    assert.equal(withShock.recurringMargin, without.recurringMargin);
    assert.equal(withShock.monthOneMargin, -70);
  }
});
test("coercible non-numeric values cannot enter the engine", () => {
  for (const income of [true, false, [], {}, " ", "\t"]) {
    assert.ok(validateScenario({ ...base, income }).income);
    assert.throws(() => simulate({ ...base, income }));
  }
});

test("reference fixture: dated ledger, cost, margin and buffer reconcile", () => {
  const result = simulate(base);
  assert.equal(result.terms.emi, 3120);
  assert.equal(result.terms.fee, 360);
  assert.equal(result.terms.total, 9360);
  assert.equal(result.recurringMargin, 530);
  assert.equal(result.monthOneMargin, 530);
  assert.equal(result.lowestBalance, 1100);
  assert.equal(result.lowestDay, 4);
  assert.equal(result.closingBalance, 3530);
  assert.equal(result.reason, "FLOW_ALIGNED");
  assert.deepEqual(
    result.ledger.map(({ day, balance }) => [day, balance]),
    [
      [2, 1500],
      [4, 1100],
      [5, 7100],
      [10, 3980],
      [12, 3530],
    ],
  );
});
test("same monthly total, delayed day-20 stipend fails timing", () => {
  const result = simulate({ ...base, stipendDay: 20 });
  assert.equal(result.recurringMargin, 530);
  assert.equal(result.closingBalance, 3530);
  assert.equal(result.lowestBalance, -2470);
  assert.equal(result.lowestDay, 12);
  assert.equal(result.firstBreach.day, 10);
  assert.equal(result.requiredTopUp, 3470);
  assert.equal(result.reason, "BUFFER_BREACH");
});
test("moving late-stipend EMI to day 24 still leaves essential gap", () => {
  const result = simulate({ ...base, stipendDay: 20, emiDay: 24 });
  assert.equal(result.lowestBalance, 650);
  assert.equal(result.firstBreach.day, 12);
  assert.equal(result.requiredTopUp, 350);
  assert.equal(result.status, "PAUSE");
  assert.equal(exploreSchedule({ ...base, stipendDay: 20 }).suggested, null);
});
test("₹600 day-3 shock breaches buffer, keeps recurring margin separate", () => {
  const result = simulate({ ...base, shock: 600, shockDay: 3 });
  assert.equal(result.recurringMargin, 530);
  assert.equal(result.monthOneMargin, -70);
  assert.equal(result.lowestBalance, 500);
  assert.equal(result.firstBreach.day, 3);
  assert.equal(result.closingBalance, 2930);
});
test("expenses precede income on same day and intraday trough is retained", () => {
  const result = simulate({ ...base, stipendDay: 10 });
  assert.deepEqual(
    result.ledger.filter((row) => row.day === 10).map((row) => row.kind),
    ["emi", "income"],
  );
  assert.equal(result.firstBreach.balance, -2020);
  assert.equal(result.lowestBalance, -2020);
  assert.equal(result.status, "PAUSE");
});
test("a structural deficit cannot be hidden by a high opening balance", () => {
  const result = simulate({ ...base, income: 4000, openingBalance: 50000 });
  assert.equal(result.recurringMargin, -1470);
  assert.equal(result.timingPass, true);
  assert.equal(result.status, "PAUSE");
  assert.equal(result.reason, "MONTHLY_DEFICIT");
  assert.equal(
    exploreSchedule({ ...base, income: 4000, openingBalance: 50000 }).suggested,
    null,
  );
});
test("all three installments reconcile to the total including fractional paise rounding", () => {
  const terms = loanTerms(1000.01);
  assert.equal(
    Math.round(terms.installments.reduce((a, b) => a + b, 0) * 100),
    104001,
  );
  assert.deepEqual(terms.installments, [346.67, 346.67, 346.67]);
  assert.deepEqual(loanTerms(1000).installments, [346.66, 346.66, 346.68]);
});
test("full-term projection repeats recurring events and applies shock once", () => {
  const result = simulate({ ...base, shock: 600 }, { months: 3 });
  assert.equal(result.horizon, 90);
  assert.equal(result.ledger.filter((row) => row.kind === "shock").length, 1);
  assert.equal(result.ledger.filter((row) => row.kind === "emi").length, 3);
  assert.equal(result.closingBalance, 3990);
  assert.equal(result.lowestBalance, 500);
});
test("existing repayments affect both gates and settle on day 8 each cycle", () => {
  const result = simulate({ ...base, existingDebt: 800 }, { months: 3 });
  assert.equal(result.recurringMargin, -270);
  assert.deepEqual(
    result.ledger.filter((row) => row.kind === "debt").map((row) => row.day),
    [8, 38, 68],
  );
  assert.equal(result.closingBalance, 2190);
});
test("buffer equality passes, below-buffer opening balance fails before day 1", () => {
  assert.equal(simulate({ ...base, openingBalance: 2900 }).lowestBalance, 1000);
  assert.equal(
    simulate({ ...base, openingBalance: 2900 }).status,
    "REVIEWABLE",
  );
  assert.equal(
    simulate({ ...base, openingBalance: 999, stipendDay: 1 }).firstBreach.day,
    0,
  );
});
test("unsafe values, missing values and invalid days never reach calculation", () => {
  for (const [key, value] of [
    ["income", ""],
    ["income", NaN],
    ["income", Infinity],
    ["income", -1],
    ["principal", 10001],
    ["principal", 0],
    ["stipendDay", 0],
    ["stipendDay", 31],
    ["emiDay", 2.5],
    ["shock", -1],
    ["openingBalance", 2.333],
  ]) {
    assert.ok(validateScenario({ ...base, [key]: value })[key], key);
    assert.throws(() => simulate({ ...base, [key]: value }), RangeError);
  }
  assert.throws(() => simulate(base, { months: 2 }), RangeError);
});
test("every event and every forecast obeys conservation of cash", () => {
  for (const stipendDay of [1, 5, 10, 20, 30])
    for (const emiDay of [1, 10, 24, 30]) {
      const scenario = {
        ...base,
        stipendDay,
        emiDay,
        shock: 250.25,
        existingDebt: 120.5,
      };
      const result = simulate(scenario, { months: 3 });
      let balance = Math.round(scenario.openingBalance * 100);
      for (const row of result.ledger) {
        balance += Math.round(row.change * 100);
        assert.equal(Math.round(row.balance * 100), balance);
      }
      assert.equal(Math.round(result.closingBalance * 100), balance);
      assert.equal(
        result.lowestBalance,
        Math.min(
          scenario.openingBalance,
          ...result.ledger.map((row) => row.balance),
        ),
      );
      assert.equal(result.timingPass, result.lowestBalance >= POLICY.buffer);
      assert.equal(result.points.at(-1).balance, result.closingBalance);
    }
});
test("schedule recommendations satisfy all gates over the whole loan term", () => {
  const schedule = exploreSchedule(base);
  assert.ok(schedule.suggested);
  assert.equal(schedule.options.length, 30);
  for (const option of schedule.feasible)
    assert.equal(
      simulate({ ...base, emiDay: option.day }, { months: 3 }).status,
      "REVIEWABLE",
    );
});
