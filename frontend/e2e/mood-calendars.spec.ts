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
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    name.split(" ")[0]!,
  );
}

test.describe("ánimo", () => {
  test("se puede cambiar el ánimo ya registrado, con etiquetas y nota", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/mood");
    await page.getByRole("radio", { name: "Happy" }).click();
    await page.getByRole("button", { name: "Friends" }).click();
    await page.getByLabel("Add a note (optional)").fill("Buen día");
    await page.getByRole("button", { name: "Save mood" }).click();
    await expect(page.getByText("Mood saved")).toBeVisible();
    await expect(page.getByText(/Logged \d/)).toBeVisible();

    // Cambiar de opinión: la misma pantalla lo permite y avisa de desde qué emoción.
    await page.getByRole("radio", { name: "Sad" }).click();
    await expect(page.getByText(/Changing from Happy/)).toBeVisible();
    await page.getByRole("button", { name: "Update mood" }).click();
    await expect(page.getByText("Mood updated")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("radio", { name: "Sad" })).toBeChecked();
    await expect(page.getByLabel("Add a note (optional)")).toHaveValue(
      "Buen día",
    );
    await expect(page.getByRole("button", { name: "Friends" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("registrar y editar un día anterior, ver la racha y borrarlo", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/mood");
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(
      page.getByRole("heading", { name: "Yesterday" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Loved" }).click();
    await page.getByRole("button", { name: "Save mood" }).click();
    await expect(page.getByText("Mood saved")).toBeVisible();
    await expect(page.getByText("Streak")).toBeVisible();

    await page.getByRole("button", { name: "Delete entry" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByText("Entry deleted")).toBeVisible();
    await expect(page.getByText("Not logged yet")).toBeVisible();
  });

  test("no se puede registrar un día futuro", async ({ page }) => {
    await register(page);
    await page.goto("/mood");
    await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();
    const grid = page.getByRole("group", { name: "Calendar", exact: true });
    await expect(grid.getByRole("button", { pressed: true })).toHaveCount(1);
  });
});

test.describe("calendarios", () => {
  test("crear un calendario, poner un evento en él y ocultarlo con su botón", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Calendars", exact: true }).click();
    await page.getByRole("button", { name: "New calendar" }).click();
    await page.getByLabel("Name").fill("Familia");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Calendar saved")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "New event" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Cena en casa");
    await dialog
      .getByLabel("Calendar", { exact: true })
      .selectOption({ label: "Familia" });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    const chips = page.getByRole("group", { name: "My calendars" });
    await expect(chips.getByRole("button", { name: /Personal/ })).toBeVisible();
    const edit = page.getByRole("button", { name: "Edit: Cena en casa" });
    await expect(edit).toBeVisible();
    await chips.getByRole("button", { name: /Familia/ }).click(); // ocultar
    await expect(edit).toHaveCount(0);
    await chips.getByRole("button", { name: /Familia/ }).click(); // mostrar
    await expect(edit).toBeVisible();
  });

  test("mis datos (ánimo) salen en el calendario como capa privada", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/mood");
    await page.getByRole("radio", { name: "Happy" }).click();
    await page.getByRole("button", { name: "Save mood" }).click();
    await expect(page.getByText("Mood saved")).toBeVisible();

    await page.goto("/calendar");
    const layers = page.getByRole("group", { name: "My data (private)" });
    await expect(layers.getByRole("button", { name: "Mood" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Happy").first()).toBeVisible();
    await layers.getByRole("button", { name: "Mood" }).click();
    await expect(page.getByText("Happy")).toHaveCount(0);
  });

  test("cambiar entre mis calendarios y los compartidos conmigo", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: /Shared with me/ }).click();
    await expect(
      page.getByText(/Nobody is sharing a calendar with you/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "My calendars" }),
    ).toBeVisible();
  });
});

test.describe("compartir calendarios entre personas", () => {
  test("un calendario con una persona y otro con varias; cada una ve solo los suyos", async ({
    browser,
  }) => {
    const contexts = await Promise.all(
      [0, 1, 2].map(() =>
        browser.newContext({
          storageState: {
            cookies: [],
            origins: [
              {
                origin: "http://localhost:5173",
                localStorage: [{ name: "onmi.welcomed", value: "1" }],
              },
            ],
          },
        }),
      ),
    );
    const [owner, bob, carol] = await Promise.all(
      contexts.map((c) => c.newPage()),
    );
    await register(owner!, "Owner Test");
    await register(bob!, "Bob Test");
    await register(carol!, "Carol Test");

    // Bob y Carol piden conectar con el código del dueño y él acepta a los dos.
    await owner!.goto("/buddies");
    const code = (await owner!.getByLabel("Your code").textContent())!.trim();
    for (const p of [bob!, carol!]) {
      await p.goto("/buddies");
      await p.getByLabel("Their code").fill(code);
      await p.getByRole("button", { name: "Send request" }).click();
      await expect(p.getByText("Waiting for an answer")).toBeVisible();
    }
    await owner!.reload();
    for (let i = 0; i < 2; i++)
      await owner!.getByRole("button", { name: "Accept" }).first().click();
    await expect(owner!.getByText("Bob Test").first()).toBeVisible();
    await expect(owner!.getByText("Carol Test").first()).toBeVisible();

    // «Familia» con Bob y Carol; «Trabajo» solo con Bob.
    await owner!.goto("/calendar");
    for (const [name, people] of [
      ["Familia", ["Bob Test", "Carol Test"]],
      ["Trabajo", ["Bob Test"]],
    ] as const) {
      await owner!
        .getByRole("button", { name: "Calendars", exact: true })
        .click();
      await owner!.getByRole("button", { name: "New calendar" }).click();
      await owner!.getByLabel("Name").fill(name);
      for (const person of people)
        await owner!.getByRole("switch", { name: person }).click();
      await owner!.getByRole("button", { name: "Save", exact: true }).click();
      await expect(owner!.getByText("Calendar saved").first()).toBeVisible();
      await owner!.keyboard.press("Escape");
      await owner!.getByRole("button", { name: "New event" }).first().click();
      const d = owner!.getByRole("dialog");
      await d.getByLabel("Title").fill(`Plan ${name}`);
      await d.getByLabel("Calendar", { exact: true }).selectOption({
        index:
          (await d
            .getByLabel("Calendar", { exact: true })
            .locator("option")
            .count()) - 1,
      });
      await d.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        owner!.getByRole("button", { name: `Edit: Plan ${name}` }),
      ).toBeVisible();
    }

    // Bob ve los dos calendarios (el botón dice «Compartidos conmigo» y deja elegir); Carol, uno solo.
    await bob!.goto("/calendar");
    await bob!.getByRole("button", { name: /Shared with me/ }).click();
    await bob!.keyboard.press("Escape");
    await expect(bob!.getByText("Plan Familia").first()).toBeVisible();
    await expect(bob!.getByText("Plan Trabajo").first()).toBeVisible();

    // Elegir cuántos ver a la vez: quitar «Trabajo» deja solo «Familia»; «Ver todos» los devuelve.
    await bob!.getByRole("button", { name: /Shared with me/ }).click();
    await bob!.getByRole("menuitemcheckbox", { name: /Trabajo/ }).click();
    await bob!.getByRole("menuitemcheckbox", { name: /Familia/ }).waitFor();
    await bob!.keyboard.press("Escape");
    await expect(bob!.getByText("Plan Trabajo")).toHaveCount(0);
    await expect(bob!.getByText("Plan Familia").first()).toBeVisible();
    await bob!.getByRole("button", { name: /Shared with me/ }).click();
    await bob!.getByRole("menuitem", { name: "Show all" }).click();
    await bob!.keyboard.press("Escape");
    await expect(bob!.getByText("Plan Trabajo").first()).toBeVisible();

    await carol!.goto("/calendar");
    await carol!.getByRole("button", { name: /Owner Test · Familia/ }).click();
    await expect(carol!.getByText("Plan Familia").first()).toBeVisible();
    await expect(carol!.getByText("Plan Trabajo")).toHaveCount(0);

    await Promise.all(contexts.map((c) => c.close()));
  });
});
