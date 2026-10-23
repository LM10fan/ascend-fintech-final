import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.ASCEND_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const errors = [];
const routes = ["/apply", "/decision-lab", "/assessment", "/credit"];
await mkdir("artifacts/browser-qa", { recursive: true });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200, route + " should load directly");
      assert.equal(new URL(page.url()).pathname, route);
      assert.equal(await page.locator("main").count(), 1);
      assert.ok((await page.locator("main").innerText()).trim().length > 50, route + " should render content");
      assert.ok(await page.locator('nav[aria-label="Main navigation"] a[aria-current="page"]').count() === 1);
      await page.screenshot({ path: `artifacts/browser-qa/${viewport.width}-${route.slice(1)}.png`, fullPage: true, animations: "disabled" });
      const touchTargets = await page.locator('nav[aria-label="Main navigation"] a').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent.trim(), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
      if (viewport.width <= 390) {
        for (const target of touchTargets) {
          assert.ok(target.height >= 24 && target.width >= 24, `Navigation touch target too small: ${target.text} (${target.width}x${target.height})`);
        }
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 2, route + " horizontal overflow at " + viewport.width + "px: " + overflow);
    }
    await page.goto(base + "/apply");
    for (const route of routes.slice(1)) {
      const label = route === "/decision-lab" ? /Decision Lab/ : route === "/assessment" ? /Assessment/ : /Credit Ladder/;
      await page.getByRole("link", { name: label }).click();
      assert.equal(new URL(page.url()).pathname, route, "navigation should work on " + viewport.width + "px");
    }
    await page.goto(base + "/apply");
    await page.getByRole("link", { name: /Decision Lab/ }).click();
    assert.equal(new URL(page.url()).pathname, "/decision-lab");
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, "/apply");
    // Applicant journey: consent is mandatory before the decision lab unlocks.
    await page.goto(base + "/apply");
    const enterLab = page.getByRole("button", { name: /^Enter Decision Lab/ });
    assert.equal(await enterLab.isDisabled(), true, "Decision Lab must be consent gated");
    await page.getByLabel(/Use my historical spending data/).check();
    await page.getByLabel(/Assess purchase affordability using these inputs/).check();
    await page.getByRole("button", { name: /Record selected consents/ }).click();
    assert.equal(await enterLab.isEnabled(), true, "Consent should unlock the lab");
    await enterLab.click();
    assert.equal(new URL(page.url()).pathname, "/decision-lab");
    assert.ok((await page.getByTestId("lowest-balance").innerText()).includes("1,100"));
    await page.getByRole("button", { name: /Delay to 20th/ }).click();
    assert.ok((await page.getByTestId("lowest-balance").innerText()).includes("2,470"), "late stipend should expose the cash-flow breach");
    const alternatives = page.getByRole("region", { name: "Explore safer alternatives" });
    const tryAlternative = alternatives.getByRole("button", { name: /^Try this scenario:/ }).first();
    assert.ok(await tryAlternative.count() > 0, "late stipend should offer a qualifying alternative");
    const before = await page.getByTestId("lowest-balance").innerText();
    await tryAlternative.click();
    assert.notEqual(await page.getByTestId("lowest-balance").innerText(), before, "recommendation should update the projection");
    await page.getByRole("link", { name: /Assessment/ }).click();
    assert.equal(new URL(page.url()).pathname, "/assessment");
    await page.getByRole("link", { name: /Credit Ladder/ }).click();
    assert.equal(new URL(page.url()).pathname, "/credit");
    // Browser reload must retain consent and the chosen financial scenario.
    await page.goto(base + "/decision-lab");
    const savedMinimum = await page.getByTestId("lowest-balance").innerText();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByTestId("lowest-balance").innerText(), savedMinimum, "scenario must survive reload");
    assert.ok(await page.getByText(/Consent active/).count() > 0, "consent should persist across navigation and reload");

    await context.close();
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log("PASS: four deep links, desktop/mobile layout, navigation and history, no page errors; eight screenshots captured");
} finally {
  await browser.close();
}
