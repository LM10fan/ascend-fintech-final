import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:5173/assessment",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
window.scrollTo = () => {};
const React = (await import("react")).default;
const { render, screen, fireEvent, cleanup, act } = await import("@testing-library/react");
const { default: App } = await import("../src/App.jsx");
const { createDemoServices } = await import("../src/features/ascend/integrations/demoServices.js");
const { STORE_KEY } = await import("../src/features/ascend/data/demoStore.js");

const services = createDemoServices({ latencyMs: 0 });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const click = async (element) => { fireEvent.click(element); await flush(); };
const button = (name) => screen.getByRole("button", { name });
const text = (id) => screen.getByTestId(id).textContent;
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const stored = () => JSON.parse(localStorage.getItem(STORE_KEY));

render(<App services={services} />);

// Assessment page: honest starting state.
assert.ok(screen.getByRole("heading", { name: /Know your numbers/ }));
assert.ok(screen.getByText("LINKED ACCOUNTS"));
assert.equal(button(/Analyze My Credit Profile/).disabled, true, "CTA needs a verified SDA");
assert.equal(text("sda-balance"), "—");
assert.equal(screen.queryByTestId("preview-limit"), null, "no limit before verification");

// AA consent is explicit; analysis runs only after it.
await click(button(/Connect AA & analyse statements/));
assert.ok(screen.getByRole("alert").textContent.includes("Tick the consent box"));
fireEvent.click(screen.getByLabelText(/I consent to share this account's statements/));
await click(button(/Connect AA & analyse statements/));
assert.equal(text("aa-income"), "₹6,000");
assert.equal(text("aa-confidence"), "high");
assert.ok(screen.getByRole("region", { name: "Ascend Pay" }));

// SDA verification drives the preview.
await click(button(/Verify SDA balance/));
assert.equal(text("sda-balance"), "₹10,000");
assert.equal(text("available-savings"), "₹10,000");
assert.equal(text("confirmed-lien"), "₹0");
assert.equal(text("preview-limit"), "₹3,500");
assert.equal(text("preview-lien"), "₹3,500");
assert.equal(text("proposed-lien"), "₹3,500");
assert.equal(text("preview-repayment"), "₹1,213.34");
assert.ok(screen.getByText(/Proposed, not approved/));

// Balance edits propagate everywhere; invalid input never commits.
await click(button("Applicant data"));
change("SDA balance at the bank", "-5");
assert.ok(screen.getByText("SDA balance cannot be negative."));
assert.equal(text("sda-balance"), "₹10,000");
change("SDA balance at the bank", "20000");
await flush();
assert.equal(text("sda-balance"), "₹20,000");
assert.equal(text("preview-limit"), "₹4,000", "L2 no longer affordable, steps down to L1");
change("SDA balance at the bank", "10000");
await flush();
assert.equal(text("preview-limit"), "₹3,500");

// SDA failure never leaves a false verification behind.
change("Next SDA check result", "FAILURE");
await click(button(/Refresh SDA verification/));
assert.equal(text("sda-balance"), "—");
assert.equal(button(/Analyze My Credit Profile/).disabled, true);
assert.ok(screen.getAllByText(/could not verify this account/).length >= 1);
change("Next SDA check result", "SUCCESS");
await click(button(/Verify SDA balance/));
assert.equal(text("sda-balance"), "₹10,000");

// UPI: validation, then provider-confirmed success.
await click(button(/Continue to UPI app/));
assert.ok(screen.getByText("Enter a valid UPI ID, like name@bank."));
assert.equal(screen.queryByRole("dialog"), null);
fireEvent.change(screen.getByLabelText("Your UPI ID"), { target: { value: "aarav@demo" } });
change("Payment amount", "500");
await click(button(/Continue to UPI app/));
assert.ok(screen.getByRole("dialog", { name: "Complete your payment" }));
assert.equal(screen.queryByLabelText(/PIN|password/i), null, "checkout never collects credentials");
assert.equal(button(/Continue to UPI app/).disabled, true, "no duplicate submission while in progress");
assert.equal(screen.queryByRole("button", { name: "Payment failed" }), null, "gateway offers only approve or cancel");
await click(button("I have approved the payment"));
assert.equal(text("payment-status"), "SUCCESS");
assert.equal(text("sda-balance"), "₹10,500");
assert.equal(text("preview-limit"), "₹3,675");
assert.equal(screen.queryByRole("button", { name: "Check status" }), null);
assert.equal(stored().credit.payments[0].applied, true);

// Cancelled payments change nothing.
await click(button(/Net banking/));
change("Your bank", "example-coop");
await click(button(/Continue to your bank/));
assert.ok(screen.getByText(/Partner Co-operative Bank's own page/));
await click(button("Cancel and return to Ascend"));
assert.equal(text("payment-status"), "CANCELLED");
assert.equal(text("sda-balance"), "₹10,500");
const billOption = screen.getByRole("option", { name: /Pay my Ascend credit bill/ });
assert.equal(billOption.disabled, true, "no facility, no bill payment");
assert.equal(stored().credit.payments.length, 2);

// Analyze → CIBIL & Credit Ladder with identical numbers.
const previewLimit = text("preview-limit");
await click(button(/Analyze My Credit Profile/));
assert.equal(window.location.pathname, "/credit");
assert.equal(text("assigned-level"), "Level 2 · Habit");
assert.equal(text("bd-limit"), previewLimit);
assert.equal(text("bd-sda"), "₹10,500");
assert.equal(text("bd-proposed"), "₹3,675");
assert.equal(text("bd-confirmed"), "₹0");
assert.equal(text("bd-available-credit"), "₹0");
assert.equal(text("power-credit"), "₹0");
assert.equal(text("power-savings"), "₹10,500");
assert.equal(text("verified-score"), "No CIBIL score available yet.");
assert.equal(text("lender-headline"), "Your profile is ready for lender review.");
assert.equal(stored().credit.application.status, "ASSESSED");

// Fetch My CIBIL Score: consent first; no history is not negative.
await click(button("Fetch My CIBIL Score"));
assert.equal(button(/Request my report/).disabled, true);
fireEvent.click(screen.getByLabelText(/I authorise Ascend to request my credit report/));
await click(button(/Request my report/));
assert.ok(screen.getByText("NO BUREAU HISTORY"));
assert.ok(screen.getByText(/A missing score is not a score of zero/));
assert.equal(text("assigned-level"), "Level 2 · Habit");

// A bureau report is labelled and never upgrades the level by itself.
await click(button("Applicant data"));
change("Bureau response", "RETRIEVED_CLEAN");
await click(button("Fetch My CIBIL Score"));
fireEvent.click(screen.getByLabelText(/I authorise Ascend to request my credit report/));
await click(button(/Request my report/));
assert.equal(text("simulated-score"), "781");
assert.ok(screen.getByText("BUREAU REPORT"));
assert.equal(screen.queryByTestId("verified-score"), null);
assert.equal(text("assigned-level"), "Level 2 · Habit");
change("Bureau response", "PROVIDER_UNAVAILABLE");
await click(button("Refresh my report"));
fireEvent.click(screen.getByLabelText(/I authorise Ascend to request my credit report/));
await click(button(/Request my report/));
assert.ok(screen.getByText(/provider is unavailable right now/));
change("Bureau response", "IDENTITY_REQUIRED");
await click(button("Fetch My CIBIL Score"));
fireEvent.click(screen.getByLabelText(/I authorise Ascend to request my credit report/));
await click(button(/Request my report/));
assert.ok(screen.getByText("IDENTITY CHECK NEEDED"));
await click(button("Complete identity check"));
assert.ok(screen.getByText("NO BUREAU HISTORY"));
await click(button("Withdraw bureau consent"));
assert.ok(screen.getByText("NOT REQUESTED"));
assert.equal(stored().credit.bureau.requestId, null);

// Lender review is a hand-off, never an approval.
await click(button("Share profile for lender review"));
assert.equal(button("Shared for lender review").disabled, true);
assert.ok(screen.getByText(/Received by Campus Finance/));
assert.ok(screen.getByText("Only the lender decides."));
assert.equal(stored().credit.application.status, "SUBMITTED_FOR_REVIEW");

// Kabir: existing facility, bill payment, upgrade path and fast-track.
change("Applicant", "kabir");
await flush();
assert.equal(text("assigned-level"), "Not assessed yet");
assert.ok(screen.getByText(/Verify your SDA balance on the Assessment page/));
await click(screen.getByRole("link", { name: /Assessment/ }));
assert.equal(window.location.pathname, "/assessment");
await click(button(/Verify SDA balance/));
assert.equal(text("preview-limit"), "₹10,000", "no AA data: provisional, fully secured Level 1");
assert.equal(text("confirmed-lien"), "₹17,500");
assert.equal(text("available-savings"), "₹32,500");
fireEvent.click(screen.getByLabelText(/I consent to share this account's statements/));
await click(button(/Connect AA & analyse statements/));
assert.equal(text("preview-limit"), "₹30,000");
assert.ok(screen.getByText("ELIGIBLE FOR FAST-TRACK LENDER REVIEW"));
change("What is this payment for?", "BILL_PAYMENT");
change("Payment amount", "5000");
fireEvent.change(screen.getByLabelText("Your UPI ID"), { target: { value: "kabir@demo" } });
await click(button(/Continue to UPI app/));
assert.ok(screen.getByText(/Amount must be between ₹1 and ₹4,200/));
change("Payment amount", "1000");
await click(button(/Continue to UPI app/));
await click(button("I have approved the payment"));
assert.equal(text("payment-status"), "SUCCESS");
assert.equal(text("preview-limit"), "₹30,000", "a payment never changes the limit");
await click(button(/Analyze My Credit Profile/));
assert.equal(text("assigned-level"), "Level 4 · Velocity");
assert.equal(text("bd-outstanding"), "₹3,200");
assert.equal(text("bd-available-credit"), "₹14,300");
assert.equal(text("bd-unsecured"), "₹15,000");
assert.equal(text("bd-upgrade"), "Level 2 → 4");
assert.ok(button(/Request upgrade review to Level 4/));
assert.ok(screen.getByText("FAST-TRACK REVIEW"));

// Neha: affordability problem pauses the journey.
await click(button("Applicant data"));
change("Applicant", "neha");
await flush();
await click(screen.getByRole("link", { name: /Assessment/ }));
await click(button(/Verify SDA balance/));
fireEvent.click(screen.getByLabelText(/I consent to share this account's statements/));
await click(button(/Connect AA & analyse statements/));
assert.ok(screen.getByText(/responsible step/));
assert.equal(screen.queryByTestId("preview-limit"), null);
await click(button(/Analyze My Credit Profile/));
assert.equal(text("lender-headline"), "Not ready for lender review yet.");
assert.equal(button("Share profile for lender review").disabled, true);

// Aarav again: stress test links into the existing Decision Lab.
await click(button("Applicant data"));
change("Applicant", "aarav");
await flush();
await click(screen.getByRole("link", { name: /Assessment/ }));
await click(button(/Verify SDA balance/));
fireEvent.click(screen.getByLabelText(/I consent to share this account's statements/));
await click(button(/Connect AA & analyse statements/));
await click(button(/Explore in the Decision Lab/));
assert.equal(window.location.pathname, "/decision-lab");
assert.ok(screen.getByText(/Loaded from your AA analysis/));
assert.ok(screen.getByTestId("reason-code"));

// Persistence, stale verification and the original routes.
cleanup();
const saved = stored();
saved.credit.sda.checkedAt = new Date(Date.now() - 3 * 86400000).toISOString();
localStorage.setItem(STORE_KEY, JSON.stringify(saved));
window.history.replaceState({}, "", "/assessment");
render(<App services={services} />);
assert.equal(text("aa-income"), "₹6,000");
assert.ok(screen.getByText("NEEDS REFRESH"));
assert.equal(button(/Analyze My Credit Profile/).disabled, true);
assert.ok(screen.getByText(/a fresh SDA balance check/));
await click(button(/Refresh SDA verification/));
assert.equal(button(/Analyze My Credit Profile/).disabled, false);
await click(screen.getByRole("link", { name: /Apply & Consent/ }));
assert.equal(window.location.pathname, "/apply");
assert.ok(screen.getByRole("button", { name: /^Enter Decision Lab/ }));
cleanup();
console.log(
  "PASS: AA consent & analysis, SDA verify/fail/refresh, demo edits, UPI & net banking (pending/success/failed/cancelled, no double credit), bill payment, CTA to dashboard, matching numbers, CIBIL consent & states, lender hand-off, upgrade & fast-track, pause path, Decision Lab link, persistence, stale SDA, original routes.",
);
