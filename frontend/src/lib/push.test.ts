import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("decodifica base64url con y sin relleno", () => {
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array("AQI")]).toEqual([1, 2]); // sin '=' de relleno
  });

  it("traduce los caracteres propios de base64url (- y _)", () => {
    // 0xfb 0xff 0xfe se codifica como "+//+" en base64 estándar y "-__-" en base64url
    expect([...urlBase64ToUint8Array("-__-")]).toEqual([0xfb, 0xff, 0xfe]);
  });

  it("una clave VAPID pública tiene 65 bytes (punto sin comprimir)", () => {
    const key =
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });
});
