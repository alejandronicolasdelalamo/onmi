import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Sup3rsecret!";
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function register(page: Page, name = "Ana Test") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(`ana-${uid()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    name.split(" ")[0]!,
  );
}

test.describe("arranque del servidor", () => {
  test("muestra un círculo con progreso y el tiempo estimado mientras despierta", async ({
    page,
  }) => {
    await register(page);
    // El servidor «dormido» tarda en responder a la comprobación de sesión.
    await page.route("**/api/auth/me", async (route) => {
      await new Promise((r) => setTimeout(r, 6000));
      await route.continue();
    });
    await page.goto("/");
    const bar = page.getByRole("progressbar", { name: "Starting ONMi" });
    await expect(bar).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("sec left, approx.")).toBeVisible();
    await expect(page.getByText(/Tip:/)).toBeVisible();
    // Cuando responde, la app aparece sola.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana", {
      timeout: 15_000,
    });
    await expect(bar).toHaveCount(0);
  });
});

test.describe("bienvenida", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("una cuenta nueva ve la bienvenida una vez y puede saltarla", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Ana Test");
    await page.getByLabel("Email").fill(`ana-${uid()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Welcome, Ana")).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText("Yours, and private")).toBeVisible();
    await dialog.getByRole("button", { name: "Let's go" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("inicio y captura rápida", () => {
  test("Inicio muestra los anillos y la siguiente acción", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: "Quick add" }).click();
    await page.getByRole("tab", { name: "Mood" }).click();
    await page.getByRole("button", { name: "Happy" }).click();
    await expect(page.getByRole("img", { name: /^Today:/ })).toBeVisible();
    await expect(page.getByText("Up next")).toBeVisible();
  });

  test("añadir una nota desde el botón + en cualquier pantalla", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/habits");
    await page.getByRole("button", { name: "Quick add" }).click();
    await page.getByLabel("Content").fill("Comprar pan\nintegral");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.goto("/notes");
    await expect(
      page.getByRole("heading", { name: "Comprar pan" }),
    ).toBeVisible();
  });
});

test.describe("sin conexión", () => {
  test("una nota escrita sin red se guarda y se envía sola al volver", async ({
    page,
    context,
  }) => {
    await register(page);
    await context.setOffline(true);
    await expect(page.getByText("You are offline.")).toBeVisible();
    await page.getByRole("button", { name: "Quick add" }).click();
    await page.getByLabel("Content").fill("Apunte sin red");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText(/waiting to sync/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/1 note synced/)).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/notes");
    await expect(
      page.getByRole("heading", { name: "Apunte sin red" }),
    ).toBeVisible();
  });
});

test.describe("búsqueda global", () => {
  test("Ctrl+K encuentra notas y hábitos y abre la nota", async ({ page }) => {
    await register(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note" }).first().click();
    await page.getByLabel("Title").fill("Receta de lasaña");
    await page.getByLabel("Content").fill("pasta y queso");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Receta de lasaña" }),
    ).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Type a command or search…").fill("queso");
    await page.getByRole("option", { name: /Receta de lasaña/ }).click();
    await expect(page).toHaveURL(/\/notes/);
    await expect(page.getByLabel("Title")).toHaveValue("Receta de lasaña");
  });
});

test.describe("apariencia", () => {
  test("tema Medianoche y color de acento", async ({ page }) => {
    await register(page);
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Midnight" }).click();
    await expect(page.locator("html")).toHaveClass(/midnight/);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("radio", { name: "Teal" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "teal");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "teal");
    await page.getByRole("radio", { name: "Indigo" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-accent", /.+/);
  });
});

test.describe("metas con hitos", () => {
  test("añadir y marcar hitos con su progreso", async ({ page }) => {
    await register(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).first().click();
    await page.getByLabel("Goal", { exact: true }).fill("Correr 10k");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).first().click();
    const ms = page.getByRole("region", { name: "Milestones" });
    await ms.getByLabel("Add a step…").fill("Correr 5k");
    await ms.getByRole("button", { name: "Add milestone" }).click();
    await expect(ms.getByText("0/1")).toBeVisible();
    await ms.getByRole("checkbox", { name: "Correr 5k" }).click();
    await expect(ms.getByRole("checkbox", { name: "Correr 5k" })).toBeChecked();
    await expect(ms.getByText("1/1")).toBeVisible();
  });
});

test.describe("ajustes: copia de seguridad, sesiones y compartir la semana", () => {
  test("importar una copia y ver las sesiones abiertas", async ({ page }) => {
    await register(page);
    await page.goto("/settings");
    await expect(page.getByText("This device", { exact: true })).toBeVisible();
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ notes: [{ title: "Importada", content: "hola" }] }),
      ),
    });
    await expect(page.getByText(/Imported: 1 notes/)).toBeVisible();
    await page.goto("/notes");
    await expect(
      page.getByRole("heading", { name: "Importada" }),
    ).toBeVisible();
  });

  test("compartir la semana genera una imagen", async ({ page }) => {
    await register(page);
    await page.goto("/insights");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share my week" }).click();
    expect((await download).suggestedFilename()).toBe("onmi-week.png");
  });
});

test.describe("passkeys (Face ID / Touch ID)", () => {
  test("añadir una passkey y entrar con ella sin contraseña", async ({
    page,
    context,
  }) => {
    // Autenticador virtual del navegador: hace de «Face ID» sin pedir nada.
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    await register(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await expect(page.getByText("Passkey added")).toBeVisible();
    await expect(page.getByText(/Added /)).toBeVisible();

    await page.getByRole("button", { name: "Ana Test" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
  });
});
