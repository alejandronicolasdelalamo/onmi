import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

// Las claves de plural (`_one`, `_other`...) pueden variar por idioma.
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, "");

describe("traducciones", () => {
  const enKeys = new Set(keys(en).map(base));
  const esKeys = new Set(keys(es).map(base));

  it("español e inglés tienen exactamente las mismas claves", () => {
    expect([...enKeys].filter((k) => !esKeys.has(k))).toEqual([]);
    expect([...esKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it("no hay textos vacíos", () => {
    for (const dict of [en, es]) {
      for (const k of keys(dict)) {
        const value = k
          .split(".")
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], dict);
        expect(value, k).not.toBe("");
      }
    }
  });

  it("los marcadores {{x}} coinciden entre idiomas", () => {
    const get = (d: unknown, k: string) =>
      k
        .split(".")
        .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], d);
    const vars = (s: unknown) =>
      (String(s).match(/{{\w+}}/g) ?? []).sort().join(",");
    for (const k of keys(en)) {
      const other = get(es, k);
      if (other !== undefined) expect(vars(other), k).toBe(vars(get(en, k)));
    }
  });
});
