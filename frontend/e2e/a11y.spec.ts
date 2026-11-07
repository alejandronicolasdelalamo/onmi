/**
 * Auditoría automática de accesibilidad (axe-core, WCAG 2.1 A/AA) de todas las pantallas,
 * en modo claro y oscuro. Cualquier infracción grave o crítica rompe el test.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const GUEST_ROUTES = ["/login", "/register", "/forgot-password"];
const APP_ROUTES = [
  "/",
  "/notes",
  "/habits",
  "/projects",
  "/goals",
  "/mood",
  "/focus",
  "/insights",
  "/buddies",
  "/settings",
];

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400); // fin de animaciones de entrada
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      page: label,
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`accesibilidad (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (t) => localStorage.setItem("onmi-theme", t),
        theme,
      );
    });

    test("pantallas públicas", async ({ page }) => {
      for (const route of GUEST_ROUTES) {
        await page.goto(route);
        await scan(page, `${theme} ${route}`);
      }
    });

    test("pantallas de la app", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "Try the demo" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Demo",
      );
      for (const route of APP_ROUTES) {
        await page.goto(route);
        await scan(page, `${theme} ${route}`);
      }
    });
  });
}

test.describe("teclado y lectores de pantalla", () => {
  test("el título de la pestaña y el idioma del documento siguen a la pantalla", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Sign in · ONMi");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("button", { name: "Language" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveTitle("Iniciar sesión · ONMi");
  });

  test("al navegar el foco pasa al contenido principal", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.getByRole("link", { name: "Habits" }).first().click();
    await expect(page.locator("#main")).toBeFocused();
    await expect(page).toHaveTitle("Habits · ONMi");
  });

  test("el enlace 'Skip to content' es el primer elemento enfocable", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.reload(); // foco inicial limpio, como al abrir la app
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
  });

  test("mostrar y ocultar la contraseña", async ({ page }) => {
    await page.goto("/login");
    const input = page.getByLabel("Password", { exact: true });
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
