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
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar");
}

/** Respuestas de la API del calendario, para ver el fallo real si algo no se guarda. */
function watchApi(page: Page) {
  const calls: string[] = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (/\/api\/calendar\/events/.test(url) && res.request().method() !== "GET")
      calls.push(
        `${res.request().method()} ${new URL(url).pathname} -> ${res.status()} ${res.status() >= 400 ? await res.text() : ""}`,
      );
  });
  return calls;
}

async function openNew(page: Page) {
  await page.getByRole("button", { name: "New event" }).first().click();
  return page.getByRole("dialog");
}

async function save(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

/** Pulsa el lápiz del evento en el panel del día y devuelve el diálogo de edición. */
async function openEdit(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Edit: ${title}` })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Edit event");
  return dialog;
}

test.describe("calendario: editar lo que se acaba de crear", () => {
  test("un evento de todo el día se puede renombrar, hacer con hora y volver a todo el día", async ({
    page,
  }) => {
    const calls = watchApi(page);
    await register(page);
    let dialog = await openNew(page);
    await dialog.getByLabel("Title").fill("Dentista");
    await save(page);
    await expect(
      page.getByRole("button", { name: "Edit: Dentista" }).first(),
    ).toBeVisible();

    // 1) Cambiar el título.
    dialog = await openEdit(page, "Dentista");
    await expect(dialog.getByLabel("Title")).toHaveValue("Dentista");
    await dialog.getByLabel("Title").fill("Dentista 2");
    await save(page);
    await expect(
      page.getByRole("button", { name: "Edit: Dentista 2" }).first(),
    ).toBeVisible();

    // 2) Ponerle hora y duración.
    dialog = await openEdit(page, "Dentista 2");
    await dialog.getByLabel("All day").click();
    await dialog.getByLabel("Starts at").fill("10:30");
    await dialog.getByLabel("Duration").selectOption("90");
    await save(page);
    await expect(page.getByText("10:30–12:00").first()).toBeVisible();

    // 3) Volver a todo el día.
    dialog = await openEdit(page, "Dentista 2");
    await expect(dialog.getByLabel("Starts at")).toHaveValue("10:30");
    await dialog.getByLabel("All day").click();
    await save(page);
    await expect(page.getByText("10:30–12:00")).toHaveCount(0);

    // 4) Repetir cada día y luego dejar de repetir.
    dialog = await openEdit(page, "Dentista 2");
    await dialog.getByLabel("Repeat", { exact: true }).selectOption("daily");
    await save(page);
    dialog = await openEdit(page, "Dentista 2");
    await expect(dialog.getByLabel("Repeat", { exact: true })).toHaveValue(
      "daily",
    );
    await dialog.getByLabel("Repeat", { exact: true }).selectOption("none");
    await save(page);
    expect(calls.filter((c) => !/-> 20\d/.test(c))).toEqual([]);
  });

  test("los eventos que se repiten se pueden editar: días elegidos, N por semana y fecha final", async ({
    page,
  }) => {
    const calls = watchApi(page);
    await register(page);

    let dialog = await openNew(page);
    await dialog.getByLabel("Title").fill("Gym");
    await dialog.getByLabel("Repeat", { exact: true }).selectOption("weekdays");
    await dialog.getByRole("button", { name: "Every day" }).click();
    await save(page);

    dialog = await openEdit(page, "Gym");
    await expect(dialog.getByLabel("Repeat", { exact: true })).toHaveValue(
      "weekdays",
    );
    await dialog.getByRole("button", { name: "Saturday" }).click();
    await dialog.getByRole("button", { name: "Sunday" }).click();
    await dialog.getByLabel("Ends on").fill("2027-12-31");
    await save(page);

    dialog = await openEdit(page, "Gym");
    await expect(dialog.getByLabel("Ends on")).toHaveValue("2027-12-31");
    await dialog
      .getByLabel("Repeat", { exact: true })
      .selectOption("weekly_count");
    await dialog.getByRole("button", { name: "2 days per week" }).click();
    await save(page);
    await expect(page.getByText("0/2 this week").first()).toBeVisible();

    dialog = await openEdit(page, "Gym");
    await expect(
      dialog.getByRole("button", { name: "2 days per week" }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByLabel("Title").fill("Gym tarde");
    await dialog.getByLabel("All day").click();
    await dialog.getByLabel("Starts at").fill("18:00");
    await save(page);
    await expect(
      page.getByRole("button", { name: "Edit: Gym tarde" }).first(),
    ).toBeVisible();
    expect(calls.filter((c) => !/-> 20\d/.test(c))).toEqual([]);
  });

  test("un evento se puede mover de día y borrar tras crearlo", async ({
    page,
  }) => {
    const calls = watchApi(page);
    await register(page);

    let dialog = await openNew(page);
    await dialog.getByLabel("Title").fill("Reunión");
    await save(page);

    dialog = await openEdit(page, "Reunión");
    await dialog.getByLabel("Date").fill("2026-11-20");
    await save(page);
    await page.getByRole("button", { name: "Calendar settings" }).click();
    await page.getByRole("menuitem", { name: "Go to today" }).click();
    // Ya no está en el día de hoy...
    await expect(
      page.getByRole("button", { name: "Edit: Reunión" }),
    ).toHaveCount(0);
    // ...pero sí el 20, y ahí se puede volver a editar y borrar.
    await page
      .getByRole("button", { name: /November 20|20 de noviembre/ })
      .first()
      .click();
    dialog = await openEdit(page, "Reunión");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit: Reunión" }),
    ).toHaveCount(0);
    expect(calls.filter((c) => !/-> 20\d/.test(c))).toEqual([]);
  });
});

test.describe("calendario en el móvil", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("el lápiz de un evento recién creado se puede tocar y no lo tapa el botón +", async ({
    page,
  }) => {
    const calls = watchApi(page);
    await register(page);
    await page.getByRole("button", { name: "New event" }).first().tap();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Médico");
    await save(page);

    // Baja hasta el final de la página, que es donde queda el primer evento del día.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const pencil = page.getByRole("button", { name: "Edit: Médico" });
    await expect(pencil).toBeVisible();
    await page.screenshot({ path: "test-results/mobile-calendar-bottom.png" });
    await pencil.tap(); // falla si otro elemento (p. ej. el botón flotante) intercepta el toque
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      "Edit event",
    );
    await page.getByRole("dialog").getByLabel("Title").fill("Médico 2");
    await save(page);
    await expect(
      page.getByRole("button", { name: "Edit: Médico 2" }),
    ).toBeVisible();
    expect(calls.filter((c) => !/-> 20\d/.test(c))).toEqual([]);
  });
});

test("en la vista de semana también se puede editar un evento recién creado", async ({
  page,
}) => {
  const calls = watchApi(page);
  await register(page);
  const dialog = await openNew(page);
  await dialog.getByLabel("Title").fill("Yoga");
  await save(page);
  await page.getByRole("button", { name: "Calendar settings" }).click();
  await page.getByRole("menuitemradio", { name: "Week" }).click();
  const edit = await openEdit(page, "Yoga");
  await edit.getByLabel("Title").fill("Yoga suave");
  await save(page);
  await expect(
    page.getByRole("button", { name: "Edit: Yoga suave" }).first(),
  ).toBeVisible();
  expect(calls.filter((c) => !/-> 20\d/.test(c))).toEqual([]);
});

test.describe("calendario: errores al editar", () => {
  test("si la fecha final queda antes de la nueva fecha, el formulario lo explica en el campo", async ({
    page,
  }) => {
    await register(page);
    let dialog = await openNew(page);
    await dialog.getByLabel("Title").fill("Curso");
    await dialog.getByLabel("Repeat", { exact: true }).selectOption("daily");
    await dialog.getByLabel("Ends on").fill("2026-11-15");
    await save(page);

    dialog = await openEdit(page, "Curso");
    await dialog.getByLabel("Date").fill("2026-11-25"); // después de la fecha final guardada
    await dialog.getByRole("button", { name: "Save" }).click();
    // El diálogo sigue abierto y dice claramente qué pasa, junto al campo «Ends on».
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/can.t be before/i)).toBeVisible();
    // Al corregir la fecha final, se guarda.
    await dialog.getByLabel("Ends on").fill("2026-12-31");
    await save(page);
  });

  test("no se puede guardar sin fecha de inicio y el motivo se ve", async ({
    page,
  }) => {
    await register(page);
    const dialog = await openNew(page);
    await dialog.getByLabel("Title").fill("Sin fecha");
    await dialog.getByLabel("Date").fill("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("This field is required")).toBeVisible();
  });
});

test.describe("calendario en el móvil con varios eventos", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("con varios eventos en un día, todos los lápices se pueden tocar al final de la página", async ({
    page,
  }) => {
    await register(page);
    for (const name of ["Uno", "Dos", "Tres", "Cuatro"]) {
      await page.getByRole("button", { name: "New event" }).first().tap();
      await page.getByRole("dialog").getByLabel("Title").fill(name);
      await save(page);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: "test-results/mobile-calendar-many.png" });
    for (const name of ["Uno", "Dos", "Tres", "Cuatro"]) {
      const pencil = page.getByRole("button", { name: `Edit: ${name}` });
      await pencil.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      // El botón «+» flotante no debe quedar encima de ninguno.
      const covered = await pencil.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return !(top === el || el.contains(top));
      });
      expect(covered, `el lápiz de «${name}» está tapado`).toBe(false);
    }
  });
});
