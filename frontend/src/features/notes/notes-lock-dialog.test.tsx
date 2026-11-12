import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n";
import { lockNotes, notesUnlockToken } from "@/lib/notes-lock";

const api = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
const auth = vi.hoisted(() => ({ setUser: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<object>("@/lib/api")),
  api,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, setUser: auth.setUser }),
}));

import { ApiError } from "@/lib/api";
import { NotesLockDialog, type LockMode } from "./notes-lock-dialog";

const renderDialog = (mode: LockMode, onDone = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesLockDialog
        mode={mode}
        open
        onOpenChange={vi.fn()}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );

describe("NotesLockDialog", () => {
  beforeEach(async () => {
    Object.values(api).forEach((f) => f.mockReset());
    auth.setUser.mockReset();
    await i18n.changeLanguage("en");
  });
  afterEach(() => lockNotes());

  it("al crear la contraseña exige coincidencia y no llama al servidor si falla", async () => {
    const user = userEvent.setup();
    renderDialog("setup");
    await user.type(screen.getByLabelText("Notes password"), "secreta1");
    await user.type(screen.getByLabelText("Repeat password"), "distinta");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(
      await screen.findByText("The passwords do not match."),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas demasiado cortas", async () => {
    const user = userEvent.setup();
    renderDialog("setup");
    await user.type(screen.getByLabelText("Notes password"), "abc");
    await user.type(screen.getByLabelText("Repeat password"), "abc");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(
      await screen.findByText("Use at least 4 characters."),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("crear la contraseña desbloquea en memoria y avisa a quien lo pidió", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    api.post.mockResolvedValue({
      token: "tok",
      expires_in: 600,
      user: { id: 1, notes_lock_enabled: true },
    });
    renderDialog("setup", onDone);
    await user.type(screen.getByLabelText("Notes password"), "secreta1");
    await user.type(screen.getByLabelText("Repeat password"), "secreta1");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/api/notes/lock/password", {
      password: "secreta1",
    });
    expect(auth.setUser).toHaveBeenCalled();
    expect(notesUnlockToken()).toBe("tok");
  });

  it("una contraseña incorrecta se explica y no desbloquea", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(new ApiError(401, "invalid_credentials", "no"));
    renderDialog("unlock");
    await user.type(screen.getByLabelText("Notes password"), "mal-mal");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
    expect(notesUnlockToken()).toBeNull();
  });

  it("quitar la contraseña envía la actual y vuelve a bloquear la sesión", async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValue({
      user: { id: 1, notes_lock_enabled: false },
    });
    renderDialog("remove");
    await user.type(screen.getByLabelText("Current password"), "secreta1");
    await user.click(screen.getByRole("button", { name: "Remove password" }));
    await vi.waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/api/notes/lock/password", {
        current_password: "secreta1",
      }),
    );
    expect(notesUnlockToken()).toBeNull();
  });
});
