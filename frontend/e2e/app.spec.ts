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
    await page.getByRole("switch", { name: /Lock during focus/ }).click(); // sin bloqueo, para poder pausar
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(timer).not.toHaveText("25:00", { timeout: 5000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(timer).toHaveText("25:00");
  });

  test("pomodoro: el modo bloqueo tapa la app, vuelve al recargar y solo se sale manteniendo pulsado", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/focus");
    const focus = page.waitForRequest(
      (r) => r.url().endsWith("/api/pomodoro/focus") && r.method() === "PUT",
    );
    await page.getByRole("button", { name: "Start" }).click();
    await focus;
    const lock = page.getByRole("dialog", { name: "Focus mode" });
    await expect(lock).toBeVisible();
    // Lo de debajo no se puede tocar.
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await page.reload();
    await expect(lock).toBeVisible();
    // Abrir la app desde el inicio (como la PWA) también lleva al bloqueo.
    await page.goto("/");
    await expect(page).toHaveURL(/\/focus$/);
    await expect(lock).toBeVisible();
    const exit = lock.getByRole("button", { name: "Hold to give up" });
    await exit.click(); // un toque no basta
    await expect(lock).toBeVisible();
    const ended = page.waitForRequest(
      (r) => r.url().endsWith("/api/pomodoro/focus") && r.method() === "DELETE",
    );
    await exit.hover();
    await page.mouse.down();
    await page.waitForTimeout(3300);
    await page.mouse.up();
    await expect(lock).toBeHidden();
    await ended;
    await expect(page.getByRole("timer")).toHaveText("25:00");
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

test.describe("novedades", () => {
  test("insights: el demo muestra el efecto de un hábito en el ánimo", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.getByRole("link", { name: "Insights" }).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    await expect(page.getByText(/your mood averages/).first()).toContainText(
      "Morning run",
    );
    await expect(
      page.getByText(/A pattern in your data, not proof of cause/).first(),
    ).toBeVisible();
  });

  test("insights: una cuenta nueva ve cuánto falta para desbloquear patrones", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/insights");
    await expect(
      page.getByText("Patterns unlock after 14 days of mood check-ins"),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await page.getByRole("link", { name: "Log today's mood" }).click();
    await expect(page).toHaveURL(/\/mood$/);
  });

  test("primeros pasos: avanza con los datos reales y se puede ocultar", async ({
    page,
  }) => {
    await register(page);
    await expect(page.getByText("Get started with ONMi")).toBeVisible();
    await expect(page.getByText("0 of 4 done")).toBeVisible();

    await page.getByRole("link", { name: "Create your first habit" }).click();
    await page.getByLabel("Name").fill("Stretch");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Stretch" })).toBeVisible();

    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page.getByText("1 of 4 done")).toBeVisible();
    await page.getByRole("button", { name: "Hide checklist" }).click();
    await expect(page.getByText("Get started with ONMi")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Get started with ONMi")).toHaveCount(0);
  });

  test("exportar mis datos descarga un JSON con mi información", async ({
    page,
  }) => {
    const email = await register(page);
    await page.goto("/habits");
    await page.getByRole("button", { name: "New habit" }).first().click();
    await page.getByLabel("Name").fill("Journal");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();

    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download my data" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^onmi-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const path = await download.path();
    const data = JSON.parse(
      await (await import("node:fs/promises")).readFile(path, "utf-8"),
    );
    expect(data.user.email).toBe(email);
    expect(data.habits.map((h: { name: string }) => h.name)).toContain(
      "Journal",
    );
    expect(JSON.stringify(data)).not.toContain("password_hash");
  });

  test("al completar 7 días seguidos se celebra la racha", async ({ page }) => {
    await register(page);
    await page.goto("/habits");
    await page.getByRole("button", { name: "New habit" }).first().click();
    await page.getByLabel("Name").fill("Walk");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Walk" })).toBeVisible();

    // Marca los 6 días anteriores desde la tira de 14 días, y luego hoy.
    const localDay = (back: number) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    // El check es optimista (cambia al instante), así que se espera a que el servidor confirme cada día
    // antes de seguir: las peticiones concurrentes podrían procesarse en otro orden.
    const toggleAndWait = async (click: () => Promise<void>) => {
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/toggle") && r.ok()),
        click(),
      ]);
    };
    for (let back = 6; back >= 1; back--) {
      await toggleAndWait(() =>
        page.getByRole("button", { name: `Toggle ${localDay(back)}` }).click(),
      );
    }
    await toggleAndWait(() =>
      page.getByRole("button", { name: "Mark as done" }).click(),
    );
    await expect(page.getByText("7-day streak!")).toBeVisible();
  });
});

test.describe("frecuencia semanal y recordatorios", () => {
  test("un hábito de 3 veces por semana muestra su progreso semanal y racha en semanas", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/habits");
    await page.getByRole("button", { name: "New habit" }).first().click();
    await page.getByLabel("Name").fill("Gym");
    await page.getByLabel("How often").selectOption("3");
    await page.getByLabel(/Reminder/).fill("07:30");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: "Gym" })).toBeVisible();
    await expect(page.getByText("0 of 3 this week")).toBeVisible();
    await expect(page.getByTitle("Reminder at 07:30")).toBeVisible();
    await expect(page.getByText("Streak (weeks)")).toBeVisible();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/toggle") && r.ok()),
      page.getByRole("button", { name: "Mark as done" }).click(),
    ]);
    await expect(page.getByText("1 of 3 this week")).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "1 of 3 this week" }),
    ).toHaveAttribute("aria-valuenow", "1");
  });

  test("un hábito diario no muestra progreso semanal", async ({ page }) => {
    await register(page);
    await page.goto("/habits");
    await page.getByRole("button", { name: "New habit" }).first().click();
    await page.getByLabel("Name").fill("Water");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Water" })).toBeVisible();
    await expect(page.getByText(/this week/)).toHaveCount(0);
    await expect(page.getByText("Current streak")).toBeVisible();
    await expect(page.getByText("Streak (weeks)")).toHaveCount(0);
  });

  const setNotificationPermission = (page: Page, state: "default" | "denied") =>
    page.addInitScript(
      (value) =>
        Object.defineProperty(Notification, "permission", { get: () => value }),
      state,
    );

  test("ajustes: con el servidor configurado se ofrece activar los recordatorios", async ({
    page,
  }) => {
    await setNotificationPermission(page, "default");
    await register(page);
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Reminders" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enable reminders" }),
    ).toBeVisible();
  });

  test("ajustes: si el navegador bloquea las notificaciones se explica cómo desbloquearlas", async ({
    page,
  }) => {
    await setNotificationPermission(page, "denied");
    await register(page);
    await page.goto("/settings");
    await expect(page.getByText(/Notifications are blocked/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enable reminders" }),
    ).toHaveCount(0);
  });

  test("el demo incluye un hábito semanal con recordatorio", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.goto("/habits");
    await expect(page.getByTitle("Reminder at 21:00")).toBeVisible();
    await expect(page.getByText(/of 4 this week/)).toBeVisible();
  });
});

test.describe("coach semanal", () => {
  test("una cuenta nueva genera su revisión semanal sin IA y puede actualizarla", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/insights");
    await expect(
      page.getByRole("heading", { name: "Weekly coach" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Generate my weekly review" })
      .click();

    await expect(page.getByText("Generated without AI")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This week", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Next week" }),
    ).toBeVisible();

    // Persiste al recargar y se puede pedir otra versión (el servidor limita la frecuencia).
    await page.reload();
    await expect(page.getByText("Generated without AI")).toBeVisible();
    await page.getByRole("button", { name: "Refresh review" }).click();
    await expect(
      page.getByText(/You can refresh again in \d+ min/),
    ).toBeVisible();
  });

  test("el demo tiene revisión con datos reales de ejemplo", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.goto("/insights");
    await page
      .getByRole("button", { name: "Generate my weekly review" })
      .click();
    await expect(
      page.getByText(/You completed \d+% of your habit check-ins/),
    ).toBeVisible();
    await expect(page.getByText(/Morning run/).first()).toBeVisible();
  });

  test("sin clave de Claude en el servidor no se ofrece el coach con IA", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Reminders" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI coach" })).toHaveCount(
      0,
    );
    await page.goto("/insights");
    await expect(page.getByText(/Want Claude to write it/)).toHaveCount(0);
  });

  test("el coach respeta el idioma de la interfaz", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: /Switch language/ }).click();
    await page.goto("/insights");
    await page
      .getByRole("button", { name: "Generar mi revisión semanal" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Esta semana", exact: true }),
    ).toBeVisible();
  });
});

test.describe("compañeros", () => {
  test("dos personas conectan, comparten un hábito y se animan sin ver nada privado", async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await register(a, "Ana Test");
    await register(b, "Bruno Test");

    // Ana crea un hábito compartido y otro privado.
    await a.goto("/habits");
    for (const [name, share] of [
      ["Correr juntos", true],
      ["Terapia privada", false],
    ] as const) {
      await a.getByRole("button", { name: "New habit" }).first().click();
      await a.getByLabel("Name").fill(name);
      if (share) await a.getByRole("switch").click();
      const saved = a.waitForResponse(
        (r) =>
          r.url().endsWith("/api/habits") && r.request().method() === "POST",
      );
      await a.getByRole("button", { name: "Save" }).click();
      await saved;
    }

    // Bruno pide conectar con el código de Ana (con otro formato) y ella acepta.
    await a.goto("/buddies");
    const code = (await a.getByLabel("Your code").textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await b.goto("/buddies");
    await b.getByLabel("Their code").fill(code.toLowerCase().replace("-", " "));
    await b.getByRole("button", { name: "Send request" }).click();
    await expect(b.getByText("Waiting for an answer")).toBeVisible();

    await a.reload();
    await a.getByRole("button", { name: "Accept" }).click();
    await expect(a.getByText("Bruno Test")).toBeVisible();

    // Bruno solo ve el hábito compartido y puede animar una vez al día.
    await b.reload();
    await expect(b.getByText("Correr juntos")).toBeVisible();
    await expect(b.getByText("Terapia privada")).toHaveCount(0);
    await b
      .getByRole("button", { name: "Cheer Ana Test on", exact: false })
      .last()
      .click();
    await expect(
      b.getByRole("button", { name: "Cheered today" }),
    ).toBeDisabled();

    await a.reload();
    await expect(a.getByText("Bruno Test cheered you on")).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test("un código inválido da un error claro", async ({ page }) => {
    await register(page);
    await page.goto("/buddies");
    await page.getByLabel("Their code").fill("ZZZZ-ZZZZ");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("That code is not valid")).toBeVisible();
  });

  test("la cuenta demo ve compañeros de ejemplo pero no tiene código", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demo");
    await page.goto("/buddies");
    await expect(page.getByText("Sam Rivera").first()).toBeVisible();
    await expect(page.getByText(/no personal code/i)).toBeVisible();
  });
});

test.describe("pomodoro en el iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("avisa de activar No molestar antes de empezar y se puede no volver a ver", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/focus");
    await page.getByRole("button", { name: "Start" }).click();
    const reminder = page.getByRole("dialog", {
      name: "Turn on Do Not Disturb first",
    });
    await expect(reminder).toBeVisible();
    // Todavía no ha empezado: ni bloqueo ni cuenta atrás.
    await expect(page.getByRole("dialog", { name: "Focus mode" })).toBeHidden();
    await reminder.getByLabel("Don't remind me again").check();
    await reminder.getByRole("button", { name: "Done, start" }).click();
    const lock = page.getByRole("dialog", { name: "Focus mode" });
    await expect(lock).toBeVisible();

    // Con «no volver a avisarme», la siguiente vez empieza directamente.
    const exit = lock.getByRole("button", { name: "Hold to give up" });
    await exit.hover();
    await page.mouse.down();
    await page.waitForTimeout(3300);
    await page.mouse.up();
    await expect(lock).toBeHidden();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(reminder).toBeHidden();
    await expect(lock).toBeVisible();
  });
});
