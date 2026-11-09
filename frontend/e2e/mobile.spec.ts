import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Sup3rsecret!";
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Ana Test");
  await page.getByLabel("Email").fill(`ana-${uid()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
}

test.describe("móvil", () => {
  test("barra de pestañas inferior en lugar de la barra lateral", async ({
    page,
  }) => {
    await register(page);
    const tabs = page.getByRole("navigation", { name: "Main tabs" });
    await expect(tabs).toBeVisible();
    await expect(page.locator("aside").first()).toBeHidden();
    await tabs.getByRole("link", { name: "Calendar" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await tabs.getByRole("link", { name: "Habits" }).click();
    await expect(page).toHaveURL(/\/habits$/);
  });

  test("«Más» abre el menú completo y se cierra al elegir", async ({
    page,
  }) => {
    await register(page);
    await page
      .getByRole("navigation", { name: "Main tabs" })
      .getByRole("button", { name: "More" })
      .click();
    await page.getByRole("link", { name: "Goals" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole("link", { name: "Goals" })).toBeHidden();
  });

  test("las acciones de editar y borrar son visibles sin pasar el ratón", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).first().click();
    await page
      .getByRole("dialog")
      .getByLabel("Goal", { exact: true })
      .fill("Meta móvil");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    const edit = page.getByRole("button", { name: "Edit" });
    await expect(edit).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(edit.locator("xpath=..")).toHaveCSS("opacity", "1");
  });

  test("los diálogos son una hoja inferior y los campos no provocan zoom en iOS", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400); // fin de la animación de subida
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1); // pegada abajo
    const size = await dialog
      .getByLabel("Goal", { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test("no hay desplazamiento horizontal en las pantallas principales", async ({
    page,
  }) => {
    await register(page);
    for (const route of [
      "/",
      "/habits",
      "/calendar",
      "/goals",
      "/buddies",
      "/notes",
      "/projects",
      "/mood",
      "/focus",
      "/insights",
      "/settings",
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        (width) => document.documentElement.scrollWidth - width,
        page.viewportSize()!.width, // el ancho real del móvil, no el que el navegador amplía al desbordarse
      );
      expect(
        overflow,
        `${route} se desborda ${overflow}px`,
      ).toBeLessThanOrEqual(0);
    }
  });

  test("los botones y enlaces del calendario son fáciles de tocar", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "main button, nav a, nav button",
        ),
      ]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < 36 || r.width < 32))
        .map(
          ({ el, r }) =>
            `${el.textContent?.trim() || el.ariaLabel} ${Math.round(r.width)}x${Math.round(r.height)}`,
        ),
    );
    expect(small).toEqual([]);
  });
});
