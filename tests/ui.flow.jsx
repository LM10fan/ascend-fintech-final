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
assert.ok(screen.getByText("XXXXX4821K"), "parent PAN shown masked for a first application");
fireEvent.change(screen.getByLabelText("Credit journey"), {
  target: { value: "existing" },
});
assert.ok(screen.getByText("XXXXX7310A"), "own PAN shown masked for an existing borrower");
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
// Drafts may be saved, but invalid input never records consent.
assert.equal(JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}").consent ?? null, null);
fireEvent.change(screen.getByLabelText("Purchase amount"), {
  target: { value: "9000" },
});
fireEvent.click(
  screen.getByLabelText(/Use my historical spending data/),
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
assert.equal(screen.queryByText("Bureau snapshot"), null);
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
  screen.getByRole("button", { name: /Use this date in projection/ }),
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
fireEvent.change(screen.getByLabelText("Monthly stipend"), {
  target: { value: "" },
});
assert.ok(screen.getByText(/Correct the highlighted input/));
assert.equal(
  screen.getByRole("button", { name: /Export decision receipt/ }).disabled,
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
fireEvent.click(screen.getByRole("button", { name: "Delete local data" }));
fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
assert.equal(localStorage.getItem(STORE_KEY), null);
assert.equal(localStorage.getItem("teammate:page"), "keep");
assert.equal(window.location.pathname, "/apply");
assert.equal(
  screen.getAllByRole("checkbox").some((input) => input.checked),
  false,
);
// Lender onboarding: nothing is verified until every field is complete.
fireEvent.click(screen.getByRole("button", { name: /For lenders/ }));
fireEvent.click(screen.getByRole("button", { name: /Verify organization/ }));
assert.ok(screen.getByText("Choose your organization."));
assert.ok(screen.getByText("NOT YET VERIFIED"));
assert.ok(screen.getByText(/Complete the organization checks to unlock this preview/));
fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "campus" } });
fireEvent.change(screen.getByLabelText("Reviewer role"), { target: { value: "Credit analyst" } });
fireEvent.change(screen.getByLabelText("Lending focus"), { target: { value: "Education essentials" } });
assert.ok(screen.getByText("ASC-PARTNER-001"));
fireEvent.click(screen.getByLabelText(/I confirm these reviewer details are correct/));
fireEvent.click(screen.getByRole("button", { name: /Verify organization/ }));
assert.ok(screen.getByText("CHECKS PASSED"));
assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).lenderRegistered, true);
// Verified, but the applicant hasn't consented: no applicant data and no reviewer view.
assert.ok(screen.getByText(/Applicant consent is not active/));
assert.equal(screen.getByRole("button", { name: /Open reviewer view/ }).disabled, true);
// Applicant consents; the read-only preview then appears and the reviewer view opens.
fireEvent.click(screen.getByRole("button", { name: /For applicants/ }));
fireEvent.change(screen.getByLabelText("Purchase amount"), { target: { value: "9000" } });
fireEvent.click(screen.getByLabelText(/Use my historical spending data/));
fireEvent.click(screen.getByLabelText(/Assess purchase affordability using these inputs/));
fireEvent.click(screen.getByRole("button", { name: /Record selected consents/ }));
fireEvent.click(screen.getByRole("button", { name: /For lenders/ }));
const preview = screen.getByRole("region", { name: /Read-only applicant assessment preview/ });
assert.ok(within(preview).getByText("Aarav Sharma"));
assert.ok(within(preview).getByText(/Laptop repair · ₹9,000/));
// Editing any field after verification requires a fresh check.
fireEvent.change(screen.getByLabelText("Lending focus"), { target: { value: "Productive purchases" } });
assert.ok(screen.getByText("NOT YET VERIFIED"));
fireEvent.click(screen.getByRole("button", { name: /Verify organization/ }));
fireEvent.click(screen.getByRole("button", { name: /Open reviewer view/ }));
assert.equal(window.location.pathname, "/decision-lab");
assert.ok(screen.getByText(/Reviewer view/));
cleanup();
console.log(
  "PASS: masked identity, validation, consent, draft persistence, live scenarios, chart/ledger linkage, schedule exploration, full term, reset, persistence, withdrawal, manual route, namespaced deletion, lender verification, read-only preview, reviewer view.",
);