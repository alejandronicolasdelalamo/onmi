import { defineConfig, devices } from "@playwright/test";

// En local: PYTHON=ruta/al/python (con las dependencias del backend). En CI basta con `python`.
const PYTHON = process.env.PYTHON ?? "python";
const API_PORT = 5001;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    locale: "en-US",
    // La bienvenida de las cuentas nuevas ya está vista (los tests de la bienvenida lo anulan).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${WEB_PORT}`,
          localStorage: [{ name: "onmi.welcomed", value: "1" }],
        },
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Móvil: viewport de teléfono con pantalla táctil (sin hover) para comprobar la experiencia en iPhone/Android.
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      // API con base de datos SQLite desechable y sin rate limit.
      command: `${PYTHON} -m flask --app wsgi init-db --reset && ${PYTHON} -m flask --app wsgi run -p ${API_PORT}`,
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: "sqlite:///e2e.db",
        RATELIMIT_ENABLED: "false",
        FLASK_ENV: "development",
        DEMO_ENABLED: "true",
        // Claves de ejemplo: solo habilitan la opción en la interfaz (en los tests nunca se envía un push real).
        VAPID_PUBLIC_KEY:
          "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
        VAPID_PRIVATE_KEY: "e2e-private-key-not-used",
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
