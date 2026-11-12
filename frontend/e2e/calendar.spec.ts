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

async function demo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/$/); // espera a que la sesión demo esté creada
}

test.describe("calendario", () => {
  test("un evento que se repite los días elegidos y otro de «N días por semana»", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Calendar",
    );

    // Solo martes y jueves.
    await page.getByRole("button", { name: "New event" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Deep work");
    // Empieza el lunes de esta semana: así martes y jueves caen siempre dentro de la vista, sea hoy el día que sea.
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    await dialog
      .getByLabel("Date")
      .fill(
        `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`,
      );
    await dialog.getByLabel("Repeat", { exact: true }).selectOption("weekdays");
    await dialog.getByRole("button", { name: "Every day" }).click(); // atajo: todos
    for (const day of ["Monday", "Wednesday", "Friday", "Saturday", "Sunday"])
      await dialog.getByRole("button", { name: day }).click();
    await expect(
      dialog.getByRole("button", { name: "Tuesday" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Monday" }),
    ).toHaveAttribute("aria-pressed", "false");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // En la vista de semana aparece exactamente dos días.
    await page.getByRole("button", { name: "Calendar settings" }).click();
    await page.getByRole("menuitemradio", { name: "Week" }).click();
    await expect(page.getByText("Deep work", { exact: true })).toHaveCount(2);

    // 4 días por semana, los que quiera: muestra el progreso 0/4.
    await page.getByRole("button", { name: "New event" }).first().click();
    await dialog.getByLabel("Title").fill("Study");
    await dialog
      .getByLabel("Repeat", { exact: true })
      .selectOption("weekly_count");
    await dialog.getByRole("button", { name: "4 days per week" }).click();
    await expect(dialog.getByText(/until you tick 4 days/)).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("0/4 this week").first()).toBeVisible();

    // Al marcar uno como hecho, el contador sube.
    await page
      .getByRole("button", { name: "Mark as done: Study" })
      .first()
      .click();
    await expect(page.getByText("1/4 this week").first()).toBeVisible();
  });

  test("la cuenta demo no puede compartir su calendario", async ({ page }) => {
    await demo(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Calendars", exact: true }).click();
    await page.getByRole("button", { name: "New calendar" }).click();
    await expect(
      page.getByRole("dialog").getByText(/demo account is shared/),
    ).toBeVisible();
  });

  test("el demo ve eventos de ejemplo y el calendario compartido de Sam", async ({
    page,
  }) => {
    await demo(page);
    await page.goto("/calendar");
    // Con un solo calendario compartido, el botón lleva su nombre.
    await page.getByRole("button", { name: /Sam Rivera · / }).click();
    await expect(page.getByText(/Sam Rivera/).first()).toBeVisible();
  });
});

test.describe("mini perfil y objetivos compartidos", () => {
  test("una meta puede ser privada o compartida y se ve en la lista", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Goal", { exact: true }).fill("Correr un 10K");
    await dialog.getByLabel("Show to my buddies").check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Correr un 10K")).toBeVisible();
    await expect(page.getByText("Shared", { exact: true })).toBeVisible();
  });

  test("el perfil de un compañero solo muestra sus objetivos compartidos", async ({
    page,
  }) => {
    await demo(page);
    await page.goto("/buddies");
    await page.getByRole("link", { name: "Sam Rivera" }).first().click();
    await expect(page).toHaveURL(/\/buddies\/\d+$/);
    await expect(page.getByText("Run a half marathon")).toBeVisible();
    await expect(page.getByText("Read 24 books this year")).toBeVisible();
    await expect(page.getByText("Look for a new job")).toHaveCount(0); // privada
    await expect(page.getByText(/chose to share/)).toBeVisible();
  });

  test("el aviso del correo no sale si el servidor no puede enviarlo", async ({
    page,
  }) => {
    await register(page);
    await expect(page.getByText(/verify your email/i)).toHaveCount(0);
  });
});
