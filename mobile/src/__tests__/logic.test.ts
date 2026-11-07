jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import { greetingKey, localISODate } from "../dates";
import { flipToday } from "../hooks";
import { dictionaries, errorText, setLang, t } from "../i18n";
import { snippet } from "../screens/NotesScreen";
import type { Habit } from "../types";

jest.mock("@expo/vector-icons/Ionicons", () => "Ionicons");
jest.mock("@shopify/flash-list", () => ({ FlashList: "FlashList" }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({}) }));

const habit = (dates: string[]): Habit => ({
  id: 1,
  name: "Run",
  color: "#f00",
  target_per_week: 7,
  dates,
  count: dates.length,
  week_count: 0,
  streak_unit: "day",
  current_streak: 0,
  longest_streak: 0,
});

describe("fechas", () => {
  it("localISODate usa la fecha local, no la de UTC", () => {
    expect(localISODate(new Date(2025, 0, 5, 23, 59))).toBe("2025-01-05");
    expect(localISODate(new Date(2025, 11, 31, 0, 1))).toBe("2025-12-31");
  });

  it("el saludo cambia a lo largo del día", () => {
    expect([greetingKey(7), greetingKey(14), greetingKey(21)]).toEqual(["morning", "afternoon", "evening"]);
  });
});

describe("marcado optimista de hábitos", () => {
  it("marca y desmarca hoy sin mutar el original", () => {
    const original = habit(["2025-03-01"]);
    const marked = flipToday(original, "2025-03-02");
    expect(marked.dates).toEqual(["2025-03-01", "2025-03-02"]);
    expect(marked.count).toBe(2);
    expect(original.dates).toEqual(["2025-03-01"]); // inmutable
    expect(flipToday(marked, "2025-03-02").dates).toEqual(["2025-03-01"]);
  });
});

describe("traducciones", () => {
  it("español e inglés tienen exactamente las mismas claves", () => {
    expect(Object.keys(dictionaries.es).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });

  it("ningún texto está vacío y los marcadores {{x}} coinciden entre idiomas", () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
    for (const key of Object.keys(dictionaries.en) as (keyof typeof dictionaries.en)[]) {
      expect(dictionaries.en[key]).not.toBe("");
      expect(dictionaries.es[key]).not.toBe("");
      expect(vars(dictionaries.es[key])).toBe(vars(dictionaries.en[key]));
    }
  });

  it("interpola variables y cambia de idioma", () => {
    setLang("en");
    expect(t("habits.weekProgress", { done: 2, target: 3 })).toBe("2 of 3 this week");
    setLang("es");
    expect(t("habits.weekProgress", { done: 2, target: 3 })).toBe("2 de 3 esta semana");
    setLang("en");
  });

  it("los errores de la API se traducen por su código y hay un mensaje genérico", () => {
    setLang("en");
    expect(errorText("invalid_credentials")).toBe("Incorrect email or password.");
    expect(errorText("something_new")).toBe(t("errors.generic"));
    expect(errorText(undefined)).toBe(t("errors.generic"));
  });
});

describe("vista previa de notas", () => {
  it("quita la sintaxis Markdown y el código", () => {
    expect(snippet("# Title\n\n- **bold** item\n\n```js\nconsole.log(1)\n```")).toBe("Title bold item");
  });
});
