import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Sup3rsecret!";
const NOTES_PASSWORD = "ocultas1";
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// PNG de 1x1 válido.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Ana Test");
  await page.getByLabel("Email").fill(`ana-${uid()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana");
  await page.goto("/notes");
}

async function createNote(page: Page, title: string, content = "") {
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.getByLabel("Title").fill(title);
  if (content) await page.getByLabel("Content").fill(content);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.describe("papelera", () => {
  test("borrar manda a la papelera, se restaura y se elimina para siempre", async ({
    page,
  }) => {
    await register(page);
    await createNote(page, "Idea suelta", "contenido");

    await page.getByRole("heading", { name: "Idea suelta" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: /Delete/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Idea suelta" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Trash" }).click();
    await expect(
      page.getByRole("heading", { name: "Idea suelta" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("The trash is empty.")).toBeVisible();

    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Idea suelta" }),
    ).toBeVisible();

    // Otra vez a la papelera y eliminar para siempre.
    await page.getByRole("heading", { name: "Idea suelta" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: /Delete/ })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.getByRole("button", { name: "Trash" }).click();
    await page.getByRole("button", { name: "Delete forever" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete forever" })
      .click();
    await expect(page.getByText("The trash is empty.")).toBeVisible();
  });
});

test.describe("plantillas, enlaces e imágenes", () => {
  test("una plantilla rellena título y contenido", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: "New note" }).first().click();
    await page.getByRole("button", { name: "Meeting" }).click();
    await expect(page.getByLabel("Title")).toHaveValue(/^Meeting – /);
    await expect(page.getByLabel("Content")).toHaveValue(/Action items/);
  });

  test("[[enlaces]] entre notas y retroenlaces", async ({ page }) => {
    await register(page);
    await createNote(page, "Proyecto X", "el plan");
    await createNote(page, "Reunión", "Hablamos de [[Proyecto X]]");

    await page.getByRole("heading", { name: "Reunión" }).click();
    const links = page.getByRole("region", { name: "Linked notes" });
    await expect(links.getByText("Links to")).toBeVisible();
    await links.getByRole("button", { name: "Proyecto X" }).click();

    // Ahora estamos en "Proyecto X": la menciona "Reunión".
    await expect(page.getByLabel("Title")).toHaveValue("Proyecto X");
    const back = page.getByRole("region", { name: "Linked notes" });
    await expect(back.getByText("Mentioned in")).toBeVisible();
    await expect(back.getByRole("button", { name: "Reunión" })).toBeVisible();
  });

  test("añadir una imagen, verla en la vista previa y que cuente como de la nota", async ({
    page,
  }) => {
    await register(page);
    await page.getByRole("button", { name: "New note" }).first().click();
    await page.getByLabel("Title").fill("Con foto");
    await page.locator('input[type="file"]').setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByLabel("Content")).toHaveValue(
      /!\[\]\(onmi-image:\d+\)/,
    );
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.locator(".prose img")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Con foto" })).toBeVisible();
    // La tarjeta no enseña la sintaxis de la imagen.
    await expect(page.getByText("onmi-image")).toHaveCount(0);
  });
});

async function hiddenNote(page: Page, title: string, first = false) {
  await page.getByRole("button", { name: "New note" }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Content").fill(`contenido de ${title}`);
  await page
    .getByRole("button", { name: "Hide this note with the notes password" })
    .click();
  if (first) {
    const setup = page.getByRole("dialog", {
      name: "Hide notes with a password",
    });
    await setup.getByLabel("Notes password").fill(NOTES_PASSWORD);
    await setup.getByLabel("Repeat password").fill(NOTES_PASSWORD);
    await setup.getByRole("button", { name: "Save password" }).click();
    await expect(setup).toBeHidden();
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

test.describe("bloqueo automático y contraseña cada vez", () => {
  test("al salir de la app (pestaña oculta) las notas vuelven a ocultarse", async ({
    page,
  }) => {
    await register(page);
    await hiddenNote(page, "Diario", true);
    await expect(page.getByRole("heading", { name: "Diario" })).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByRole("heading", { name: "Diario" })).toHaveCount(0);
    await expect(page.getByText("Hidden note").first()).toBeVisible();
  });

  test("pedir la contraseña cada vez abre solo esa nota y no revela el resto", async ({
    page,
  }) => {
    await register(page);
    await hiddenNote(page, "Uno", true);
    await hiddenNote(page, "Dos");

    await page.reload();
    await page.getByRole("button", { name: "Notes password" }).click();
    await page
      .getByLabel("Ask for the password every time I open a hidden note")
      .check();
    await page.keyboard.press("Escape");
    // En este modo ya no hay botón global de desbloqueo.
    await expect(
      page.getByRole("button", { name: "Unlock hidden notes" }),
    ).toHaveCount(0);

    await page.getByText("Hidden note").first().click();
    const unlock = page.getByRole("dialog", { name: "Unlock hidden notes" });
    await unlock.getByLabel("Notes password").fill(NOTES_PASSWORD);
    await unlock.getByRole("button", { name: "Unlock", exact: true }).click();

    // La nota abierta se ve en el editor...
    await expect(page.getByLabel("Title")).toHaveValue(/^(Uno|Dos)$/);
    await page.getByRole("button", { name: "Cancel" }).click();
    // ...pero la lista sigue oculta, y para abrirla otra vez hay que repetir la contraseña.
    await expect(page.getByText("Hidden note")).toHaveCount(2);
    await page.getByText("Hidden note").first().click();
    await expect(
      page.getByRole("dialog", { name: "Unlock hidden notes" }),
    ).toBeVisible();
  });
});
