/**
 * Genera las capturas del README con el usuario demo (datos de ejemplo).
 * Solo se ejecuta bajo demanda:  SCREENSHOTS=1 npx playwright test screenshots
 */
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const OUT = path.resolve(import.meta.dirname, "../../docs/screenshots");
test.skip(!process.env.SCREENSHOTS, "Solo con SCREENSHOTS=1");

async function demo(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("onmi-theme", t), theme);
  await page.goto("/login");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
  await page.waitForLoadState("networkidle");
}

async function shot(
  page: Page,
  route: string,
  name: string,
  ready: string | RegExp,
) {
  await page.goto(route);
  await page.getByText(ready).first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500); // animaciones de entrada
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

for (const theme of ["light", "dark"] as const) {
  test(`capturas escritorio (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await demo(page, theme);
    await shot(page, "/", `dashboard-${theme}`, "Habits today");
    await shot(page, "/habits", `habits-${theme}`, "Morning run");
    await shot(page, "/projects", `projects-${theme}`, "Portfolio website");
    await shot(page, "/notes", `notes-${theme}`, "Welcome to ONMi");
    await shot(page, "/mood", `mood-${theme}`, "How are you feeling today?");
    await shot(page, "/focus", `focus-${theme}`, "Sessions today");
    await shot(page, "/insights", `insights-${theme}`, "What your data says");
    await shot(page, "/buddies", `buddies-${theme}`, "Sam Rivera");
  });
}

test("login claro y oscuro", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript(
      (t) => localStorage.setItem("onmi-theme", t),
      theme,
    );
    await page.goto("/login");
    await page.getByText("Welcome back").waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `login-${theme}.png`) });
    await page.evaluate(
      (t) => localStorage.setItem("onmi-theme", t),
      theme === "light" ? "dark" : "light",
    );
  }
});

test("captura móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "light");
  await shot(page, "/", "dashboard-mobile", "Habits today");
});
