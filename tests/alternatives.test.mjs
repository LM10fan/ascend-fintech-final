import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCENARIO, simulate } from "../src/features/ascend/domain/cashflow.js";
import { suggestAlternatives } from "../src/features/ascend/domain/alternatives.js";

test("recommendations are deterministic and never mutate the input", () => {
  const scenario = { ...DEFAULT_SCENARIO, stipendDay: 20 };
  const before = structuredClone(scenario);
  const first = suggestAlternatives(scenario);
  const second = suggestAlternatives(scenario);
  assert.deepEqual(scenario, before);
  assert.deepEqual(first, second);
});

test("every suggested alternative improves the projected result", () => {
  for (const stipendDay of [5, 10, 20, 30]) {
    const scenario = { ...DEFAULT_SCENARIO, stipendDay };
    const { baseline, alternatives } = suggestAlternatives(scenario);
    assert.ok(alternatives.length <= 2);
    assert.equal(new Set(alternatives.map((item) => item.kind)).size, alternatives.length);
    for (const item of alternatives) {
      const computed = simulate({ ...scenario, ...item.changes }, { months: 3 });
      assert.deepEqual(item.result, computed);
      assert.ok(
        (computed.status === "REVIEWABLE" && baseline.status !== "REVIEWABLE") ||
        (computed.lowestBalance > baseline.lowestBalance &&
          computed.recurringMargin >= baseline.recurringMargin),
      );
    }
  }
});

test("recommended principal stays within policy and is strictly lower", () => {
  const scenario = { ...DEFAULT_SCENARIO, stipendDay: 20 };
  const { alternatives } = suggestAlternatives(scenario);
  for (const item of alternatives.filter((value) => value.kind === "amount")) {
    assert.ok(item.changes.principal >= 1000);
    assert.ok(item.changes.principal < scenario.principal);
  }
});

test("the engine does not invent a lower principal below the minimum", () => {
  const scenario = { ...DEFAULT_SCENARIO, principal: 1000, stipendDay: 20 };
  const { alternatives } = suggestAlternatives(scenario);
  assert.ok(!alternatives.some((item) => item.kind === "amount"));
});
