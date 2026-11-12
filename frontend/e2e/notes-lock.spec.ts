import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Sup3rsecret!";
const NOTES_PASSWORD = "ocultas1";
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

test.describe("sesión persistente", () => {
  test("las cookies tienen caducidad (no son de sesión) para no volver a iniciar sesión", async ({
    page,
    context,
  }) => {
    await register(page);
    const cookies = await context.cookies();
    for (const name of ["access_token_cookie", "refresh_token_cookie"]) {
      const c = cookies.find((x) => x.name === name);
      expect(c, name).toBeDefined();
      // expires = -1 sería una cookie de sesión: se perdería al cerrar el navegador.
      expect(c!.expires).toBeGreaterThan(Date.now() / 1000);
    }
    const refresh = cookies.find((x) => x.name === "refresh_token_cookie")!;
    expect(refresh.expires - Date.now() / 1000).toBeGreaterThan(20 * 86400);
  });

  test("si el servidor está dormido (502) no se manda al login y se reintenta", async ({
    page,
  }) => {
    await register(page);
    let calls = 0;
    await page.route("**/api/auth/me", (route) => {
      calls += 1;
      return calls < 2
        ? route.fulfill({ status: 502, body: "Bad gateway" })
        : route.continue();
    });
    await page.goto("/notes");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Notes",
      { timeout: 15_000 },
    );
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

test.describe("notas ocultas", () => {
  test("ocultar con contraseña, que no salga nada sin desbloquear y volver a verla", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/notes");

    await page.getByRole("button", { name: "New note" }).first().click();
    await page.getByLabel("Title").fill("Mi diario");
    await page.getByLabel("Content").fill("texto-super-secreto");

    // Sin contraseña de notas todavía: pide crearla primero.
    await page
      .getByRole("button", { name: "Hide this note with the notes password" })
      .click();
    const setup = page.getByRole("dialog", {
      name: "Hide notes with a password",
    });
    await setup.getByLabel("Notes password").fill(NOTES_PASSWORD);
    await setup.getByLabel("Repeat password").fill(NOTES_PASSWORD);
    await setup.getByRole("button", { name: "Save password" }).click();
    await expect(setup).toBeHidden();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Recién creada y con las notas desbloqueadas: se ve.
    await expect(page.getByText("Mi diario")).toBeVisible();

    // Al recargar vuelve a quedar oculta: ni título ni contenido llegan a la página.
    await page.reload();
    await expect(page.getByText("Hidden note").first()).toBeVisible();
    await expect(page.getByText("Mi diario")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("texto-super-secreto");

    // Contraseña incorrecta: no se desbloquea.
    await page.getByRole("button", { name: "Unlock hidden notes" }).click();
    const unlock = page.getByRole("dialog", { name: "Unlock hidden notes" });
    await unlock.getByLabel("Notes password").fill("mal-mal");
    await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(unlock.getByText("Incorrect password.")).toBeVisible();

    // Contraseña correcta: aparece y se puede volver a bloquear.
    await unlock.getByLabel("Notes password").fill(NOTES_PASSWORD);
    await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("Mi diario")).toBeVisible();
    await page.getByRole("button", { name: "Lock now" }).click();
    await expect(page.getByText("Mi diario")).toHaveCount(0);
    await expect(page.getByText("Hidden note").first()).toBeVisible();
  });
});
