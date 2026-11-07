import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Sup3rsecret!";
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function register(page: Page, name = "Ana Test") {
  const email = `ana-${uid()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    name.split(" ")[0]!,
  );
  return email;
}

test.describe("autenticación", () => {
  test("registro, cierre de sesión y login", async ({ page }) => {
    const email = await register(page);
    await page.getByRole("button", { name: "Ana Test" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
  });

  test("las rutas privadas redirigen al login y credenciales incorrectas muestran error", async ({
    page,
  }) => {
    await page.goto("/habits");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill("nadie@example.com");
    await page.getByLabel("Password", { exact: true }).fill("whatever123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("la sesión vive en cookies httpOnly (el JS no ve el JWT)", async ({
    page,
    context,
  }) => {
    await register(page);
    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === "access_token_cookie");
    expect(access?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "access_token_cookie",
    );
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toMatch(/eyJ/);
  });

  test("recuperar contraseña no revela si el email existe", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("ghost@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
  });
});

test.describe("producto", () => {
  test("hábitos: crear, marcar hoy y ver la racha", async ({ page }) => {
    await register(page);
    await page.goto("/habits");
    await page.getByRole("button", { name: "New habit" }).first().click();
    await page.getByLabel("Name").fill("Meditate");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Meditate" })).toBeVisible();
    await page.getByRole("button", { name: "Mark as done" }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(
      page.getByText("Current streak").locator("..").getByText("1"),
    ).toBeVisible();
  });

  test("notas: crear con Markdown y etiquetas, buscar y filtrar", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note" }).first().click();
    await page.getByLabel("Title").fill("Trip plan");
    await page.getByLabel("Content").fill("# Lisbon\n\n- Alfama\n- Belém");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: "Lisbon" })).toBeVisible();
    await page.getByLabel("Tags").fill("travel");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByRole("heading", { name: "Trip plan" }),
    ).toBeVisible();
    await page.getByRole("searchbox").fill("zzz-no-match");
    await expect(page.getByText("No notes found.")).toBeVisible();
    await page.getByRole("searchbox").fill("trip");
    await expect(
      page.getByRole("heading", { name: "Trip plan" }),
    ).toBeVisible();
  });

  test("proyectos: cambiar una tarjeta de columna y se persiste", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill("Launch site");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Launch site")).toBeVisible();

    // Cambio de estado desde el diálogo (misma API que usa el drag & drop).
    await page.getByText("Launch site").click();
    await page.getByLabel("Status").selectOption("in_progress");
    await page.getByRole("button", { name: "Save" }).click();
    await page.reload();
    const column = page.getByRole("region", { name: "In progress" });
    await expect(column.getByText("Launch site")).toBeVisible();
  });

  test("pomodoro: arranca, pausa y reinicia", async ({ page }) => {
    await register(page);
    await page.goto("/focus");
    const timer = page.getByRole("timer");
    await expect(timer).toHaveText("25:00");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(timer).not.toHaveText("25:00", { timeout: 5000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(timer).toHaveText("25:00");
  });

  test("ánimo: registrar cómo me siento hoy", async ({ page }) => {
    await register(page);
    await page.goto("/mood");
    await page.getByRole("radio", { name: "Happy" }).click();
    await page.getByRole("button", { name: "Save mood" }).click();
    await expect(page.getByText("Mood saved")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Happy" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

test.describe("experiencia", () => {
  test("modo demo con datos de ejemplo", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await expect(page.getByText("Morning run").first()).toBeVisible();
    await expect(page.getByText("Portfolio website")).toBeVisible();
  });

  test("tema oscuro e idioma persisten", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Switch language" }).click();
    await expect(
      page.getByRole("link", { name: "Hábitos" }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
      page.getByRole("link", { name: "Hábitos" }).first(),
    ).toBeVisible();
  });

  test("paleta de comandos con Ctrl+K navega y crea", async ({ page }) => {
    await register(page);
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Type a command or search…").fill("new habit");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/habits/);
    await expect(page.getByRole("dialog", { name: "New habit" })).toBeVisible();
  });

  test("un usuario normal no accede al panel de admin", async ({ page }) => {
    await register(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("ruta inexistente muestra 404", async ({ page }) => {
    await register(page);
    await page.goto("/nope-nope");
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});
