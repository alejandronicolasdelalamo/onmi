import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IosSilenceGuide, isIOS } from "./ios-silence-guide";

describe("guía de silencio en iPhone", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detecta iPhone y iPad, y no otros dispositivos", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh)",
      platform: "MacIntel",
      maxTouchPoints: 5, // iPad con modo escritorio
    });
    expect(isIOS()).toBe(true);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      platform: "Win32",
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });

  it("muestra los pasos", () => {
    render(<IosSilenceGuide />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
