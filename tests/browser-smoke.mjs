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
    await context.close();
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log("PASS: four deep links, desktop/mobile layout, navigation and history, no page errors; eight screenshots captured");
} finally {
  await browser.close();
}
