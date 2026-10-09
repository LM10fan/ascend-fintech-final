import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:5173/apply",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
window.scrollTo = () => {};
const React = (await import("react")).default;
const { render, screen, fireEvent, cleanup, within } = await import(
  "@testing-library/react"
);
const { default: App } = await import("../src/App.jsx");
const { STORE_KEY } = await import("../src/features/ascend/data/demoStore.js");

render(<App />);
assert.equal(
  screen.getByRole("button", { name: /^Enter Decision Lab/ }).disabled,
  true,
);
assert.equal(
  screen.getAllByRole("checkbox").some((input) => input.checked),
  false,
);
assert.ok(screen.getByText("DEMO-PARENT-001"));
fireEvent.change(screen.getByLabelText("Credit journey"), {
  target: { value: "existing" },
});
assert.ok(screen.getByText("DEMO-SELF-001"));
fireEvent.click(
  screen.getByRole("button", { name: /Record selected consents/ }),
);
assert.ok(screen.getByRole("alert").textContent.includes("two required"));
fireEvent.change(screen.getByLabelText("Purchase amount"), {
  target: { value: "" },
});
fireEvent.click(
  screen.getByRole("button", { name: /Record selected consents/ }),
);
assert.ok(screen.getByText("Purchase amount is required."));
assert.equal(
  JSON.parse(localStorage.getItem(STORE_KEY)).inputDraft.principal,
  "",
);
assert.equal(
  JSON.parse(localStorage.getItem(STORE_KEY)).scenario.principal,
  9000,
);
assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).consent, null);
fireEvent.change(screen.getByLabelText("Purchase amount"), {
  target: { value: "9000" },
});
fireEvent.click(
  screen.getByLabelText(/Use the synthetic historical spend fixture/),
);
// Partial choices and financial inputs are shared even before recording consent.
fireEvent.change(screen.getByLabelText("Recurring monthly stipend"), {
  target: { value: "6200" },
});
fireEvent.click(screen.getByRole("link", { name: /Decision Lab/ }));
assert.equal(screen.getByTestId("monthly-margin").textContent, "₹730");
fireEvent.change(screen.getByLabelText("Monthly stipend"), {
  target: { value: "6000" },
});
fireEvent.click(screen.getByRole("link", { name: /Apply & Consent/ }));
assert.equal(screen.getByLabelText("Recurring monthly stipend").value, "6000");
assert.equal(
  screen.getByLabelText(/Use the synthetic historical spend fixture/).checked,
  true,
);
assert.equal(
  screen.getByLabelText(/Assess purchase affordability using these inputs/)
    .checked,
  false,
);
cleanup();
render(<App />);
assert.equal(
  screen.getByLabelText(/Use the synthetic historical spend fixture/).checked,
  true,
);
assert.equal(
  screen.getByRole("button", { name: /^Enter Decision Lab/ }).disabled,
  true,
);
fireEvent.click(
  screen.getByLabelText(/Assess purchase affordability using these inputs/),
);
fireEvent.click(
  screen.getByRole("button", { name: /Record selected consents/ }),
);
assert.equal(
  screen.getByRole("button", { name: /^Enter Decision Lab/ }).disabled,
  false,
);
assert.equal(
  JSON.parse(localStorage.getItem(STORE_KEY)).consent.scopes.bureau,
  false,
);
fireEvent.click(screen.getByRole("button", { name: /^Enter Decision Lab/ }));
assert.equal(window.location.pathname, "/decision-lab");
assert.equal(screen.getByTestId("monthly-margin").textContent, "₹530");
assert.equal(screen.getByTestId("lowest-balance").textContent, "₹1,100");
assert.equal(screen.getByTestId("reason-code").textContent, "FLOW_ALIGNED");
assert.equal(screen.queryByText("Simulated bureau snapshot"), null);
assert.equal(screen.getByTestId("day5-margin").textContent, "₹530");
assert.equal(screen.getByTestId("day20-margin").textContent, "₹530");
assert.equal(screen.getByTestId("day5-lowest").textContent, "₹1,100 · Day 4");
assert.equal(
  screen.getByTestId("day20-lowest").textContent,
  "-₹2,470 · Day 12",
);
assert.equal(
  screen.getByTestId("day5-closing").textContent,
  screen.getByTestId("day20-closing").textContent,
);
fireEvent.click(screen.getByRole("button", { name: /Delay to 20th/ }));
assert.equal(screen.getByTestId("lowest-balance").textContent, "-₹2,470");
assert.equal(screen.getByTestId("reason-code").textContent, "BUFFER_BREACH");
assert.ok(
  screen
    .getByRole("img", { name: /Cash balance/ })
    .textContent.includes("-₹2,470"),
);
fireEvent.click(
  screen.getByRole("button", { name: /See responsible next step/ }),
);
assert.ok(screen.getByText(/No EMI date protects the buffer/));
fireEvent.click(
  screen.getByRole("button", { name: /Use this date in simulation/ }),
);
assert.equal(screen.getByTestId("lowest-balance").textContent, "₹650");
assert.equal(screen.getByTestId("reason-code").textContent, "BUFFER_BREACH");
fireEvent.click(screen.getByRole("button", { name: "Full term" }));
assert.ok(screen.getByRole("img", { name: /Cash balance over 90 days/ }));
fireEvent.click(screen.getByRole("button", { name: /Reset scenario/ }));
assert.equal(screen.getByTestId("lowest-balance").textContent, "₹1,100");
fireEvent.click(screen.getByRole("button", { name: /600 expense shock/ }));
assert.equal(screen.getByTestId("lowest-balance").textContent, "₹500");
assert.equal(screen.getByTestId("monthly-margin").textContent, "₹530");
assert.equal(screen.getByTestId("day5-lowest").textContent, "₹500 · Day 4");
assert.equal(
  screen.getByTestId("day20-lowest").textContent,
  "-₹3,070 · Day 12",
);
fireEvent.click(screen.getByRole("button", { name: /Delay to 20th/ }));
fireEvent.click(screen.getByRole("button", { name: /Stipend on 5th/ }));
assert.equal(
  screen
    .getByRole("button", { name: /600 expense shock/ })
    .getAttribute("aria-pressed"),
  "true",
);
assert.equal(screen.getByTestId("lowest-balance").textContent, "₹500");
fireEvent.click(screen.getByLabelText("Compare with stipend on day 5"));
const comparedChart = screen.getByRole("img", { name: /Cash balance/ });
assert.equal(
  comparedChart.querySelector('path[stroke-dasharray="7 6"]').getAttribute("d"),
  comparedChart.querySelector(".asc-balance-line").getAttribute("d"),
);
fireEvent.click(screen.getByRole("button", { name: "Full term" }));
assert.equal(
  within(screen.getByRole("table")).getAllByText("One-off expense shock")
    .length,
  1,
);
assert.equal(screen.getByTestId("day5-closing").textContent, "₹3,990");
fireEvent.click(screen.getByRole("button", { name: /600 expense shock/ }));
assert.equal(
  within(screen.getByRole("table")).queryByText("One-off expense shock"),
  null,
);
assert.equal(screen.getByTestId("day5-closing").textContent, "₹4,590");
fireEvent.click(screen.getByRole("button", { name: /600 expense shock/ }));
assert.equal(screen.getByTestId("day5-closing").textContent, "₹3,990");
fireEvent.change(screen.getByLabelText("Monthly stipend"), {
  target: { value: "" },
});
assert.ok(screen.getByText(/Correct the highlighted input/));
assert.equal(
  screen.getByRole("button", { name: /Export demo receipt/ }).disabled,
  true,
);
fireEvent.click(screen.getByRole("link", { name: /Apply & Consent/ }));
assert.equal(screen.getByLabelText("Recurring monthly stipend").value, "");
cleanup();
render(<App />);
assert.equal(screen.getByLabelText("Recurring monthly stipend").value, "");
fireEvent.click(screen.getByRole("link", { name: /Decision Lab/ }));
assert.ok(screen.getByText(/Correct the highlighted input/));
assert.equal(
  screen.getByRole("button", { name: /Delay to 20th/ }).disabled,
  true,
);
fireEvent.change(screen.getByLabelText("Monthly stipend"), {
  target: { value: "4000" },
});
assert.equal(screen.getByTestId("reason-code").textContent, "MONTHLY_DEFICIT");
// Verify full reload/initialization from persisted state on a direct route.
cleanup();
render(<App />);
assert.equal(screen.getByTestId("reason-code").textContent, "MONTHLY_DEFICIT");
fireEvent.click(screen.getByRole("link", { name: /Apply & Consent/ }));
fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).mode, "manual");
assert.equal(
  screen.getByRole("button", { name: /^Enter Decision Lab/ }).disabled,
  true,
);
fireEvent.click(
  screen.getByRole("button", { name: /Continue without consent/ }),
);
assert.ok(screen.getByText(/Manual exploration/));
// Check local-only deletion does not erase the teammate's keys.
localStorage.setItem("teammate:page", "keep");
fireEvent.click(screen.getByRole("button", { name: "Delete local demo data" }));
fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
assert.equal(localStorage.getItem(STORE_KEY), null);
assert.equal(localStorage.getItem("teammate:page"), "keep");
assert.equal(window.location.pathname, "/apply");
assert.equal(
  screen.getAllByRole("checkbox").some((input) => input.checked),
  false,
);
fireEvent.click(screen.getByRole("button", { name: /For lenders/ }));
assert.equal(
  screen.getByRole("button", { name: /Open reviewer view/ }).disabled,
  true,
);
fireEvent.click(screen.getByRole("button", { name: /Simulate verification/ }));
assert.ok(screen.getByText("Choose a synthetic organization."));
assert.equal(document.activeElement.id, "lender-organizationId");
fireEvent.change(screen.getByLabelText("Synthetic organization"), {
  target: { value: "campus" },
});
fireEvent.change(screen.getByLabelText("Reviewer role"), {
  target: { value: "Credit analyst · Demo" },
});
fireEvent.change(screen.getByLabelText("Lending focus"), {
  target: { value: "Education essentials" },
});
assert.ok(screen.getByText("DEMO-ORG-001"));
fireEvent.click(
  screen.getByLabelText(/I understand this is a synthetic reviewer profile/),
);
fireEvent.click(screen.getByRole("button", { name: /Simulate verification/ }));
assert.ok(screen.getByText("SIMULATED CHECKS PASSED"));
assert.equal(
  screen.getByRole("button", { name: /Open reviewer view/ }).disabled,
  true,
); // Consent still absent.
assert.ok(screen.getByText(/Applicant consent is not active/));
cleanup();
render(<App />);
assert.ok(screen.getByText("SIMULATED CHECKS PASSED"));
fireEvent.change(screen.getByLabelText("Lending focus"), {
  target: { value: "Productive purchases" },
});
assert.ok(screen.getByText("NOT YET VERIFIED"));
fireEvent.click(screen.getByRole("button", { name: /Simulate verification/ }));
fireEvent.click(screen.getByRole("button", { name: /For applicants/ }));
fireEvent.click(
  screen.getByLabelText(/Use the synthetic historical spend fixture/),
);
fireEvent.click(
  screen.getByLabelText(/Assess purchase affordability using these inputs/),
);
fireEvent.click(screen.getByLabelText(/Show a simulated bureau snapshot/));
fireEvent.click(
  screen.getByRole("button", { name: /Record selected consents/ }),
);
fireEvent.change(screen.getByLabelText("Recurring monthly stipend"), {
  target: { value: "7000" },
});
fireEvent.click(screen.getByRole("button", { name: /For lenders/ }));
const preview = screen.getByRole("region", {
  name: "Read-only applicant assessment preview",
});
assert.ok(within(preview).getByText("₹1,530 · Pass"));
assert.equal(preview.querySelectorAll("input, select, textarea").length, 0);
fireEvent.click(screen.getByRole("button", { name: /Open reviewer view/ }));
assert.ok(screen.getByText(/Reviewer view/));
assert.equal(
  JSON.parse(localStorage.getItem(STORE_KEY)).lenderRegistered,
  true,
);
assert.equal(screen.getByTestId("monthly-margin").textContent, "₹1,530");
assert.equal(
  screen.getByRole("button", { name: /Delay to 20th/ }).disabled,
  true,
);
assert.equal(
  screen.getByRole("button", { name: /600 expense shock/ }).disabled,
  true,
);
assert.equal(
  screen.getByRole("button", { name: /Reset scenario/ }).disabled,
  true,
);
assert.equal(
  screen.getByLabelText("Monthly stipend").matches(":disabled"),
  true,
);
assert.equal(
  screen.getByRole("button", { name: /Use this date in simulation/ }).disabled,
  true,
);
assert.ok(screen.getByText("Simulated bureau snapshot"));
fireEvent.click(screen.getByRole("button", { name: "Full term" }));
assert.ok(screen.getByRole("img", { name: /Cash balance over 90 days/ }));
fireEvent.click(screen.getByRole("link", { name: /Apply & Consent/ }));
fireEvent.click(screen.getByRole("button", { name: /For applicants/ }));
fireEvent.click(screen.getByLabelText(/Show a simulated bureau snapshot/));
assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).mode, "manual");
assert.equal(
  screen.getByLabelText(/Use the synthetic historical spend fixture/).checked,
  true,
);
fireEvent.click(screen.getByRole("button", { name: /For lenders/ }));
assert.ok(screen.getByText(/Applicant consent is not active/));
fireEvent.click(screen.getByRole("link", { name: /Decision Lab/ }));
assert.ok(screen.getByText("Complete the review prerequisites."));
fireEvent.click(
  screen.getByRole("button", { name: /Return to Apply & Consent/ }),
);
fireEvent.click(screen.getByRole("button", { name: /For applicants/ }));
fireEvent.click(
  screen.getByRole("button", { name: /Record selected consents/ }),
);
fireEvent.click(screen.getByRole("button", { name: /^Enter Decision Lab/ }));
fireEvent.change(screen.getByLabelText("Existing repayment · day 8"), {
  target: { value: "200" },
});
fireEvent.click(screen.getByRole("link", { name: /Apply & Consent/ }));
assert.equal(screen.getByLabelText("Credit journey").value, "existing");
assert.equal(screen.getByLabelText("Existing monthly repayment").value, "200");
fireEvent.change(screen.getByLabelText("Credit journey"), {
  target: { value: "first" },
});
assert.equal(screen.getByLabelText("Existing monthly repayment").value, "0");
fireEvent.change(screen.getByLabelText("Synthetic applicant"), {
  target: { value: "mira" },
});
assert.equal(
  screen.getByLabelText(/Use the synthetic historical spend fixture/).checked,
  false,
);
assert.equal(
  JSON.parse(localStorage.getItem(STORE_KEY)).consent.revokedAt !== null,
  true,
);
cleanup();
console.log(
  "PASS: applicant fixtures, shared valid/invalid drafts, partial consent reload, route synchronization, paired timing comparison, shock toggles and single ledger event, full term, schedules, deletion isolation, organization validation, simulated verification/reverification, consent-gated read-only review, optional bureau revocation, credit-history synchronization and profile switching.",
);
