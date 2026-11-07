jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

const mockAuth = { login: jest.fn(), register: jest.fn(), demo: jest.fn() };
jest.mock("../auth", () => ({ useAuth: () => mockAuth }));

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../api";
import { LoginScreen } from "../screens/LoginScreen";

const press = async (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const type = async (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

beforeEach(() => {
  mockAuth.login.mockReset();
  mockAuth.register.mockReset();
  mockAuth.demo.mockReset();
});

describe("LoginScreen", () => {
  it("el botón de entrar está desactivado hasta rellenar correo y contraseña", async () => {
    await render(<LoginScreen />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await type("Email", "ana@example.com");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await type("Password", "Sup3rsecret!");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("inicia sesión con el correo recortado", async () => {
    mockAuth.login.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    await type("Email", "  ana@example.com ");
    await type("Password", "Sup3rsecret!");
    await press("Sign in");
    await waitFor(() => expect(mockAuth.login).toHaveBeenCalledWith("ana@example.com", "Sup3rsecret!"));
  });

  it("muestra el error traducido si las credenciales son incorrectas", async () => {
    mockAuth.login.mockRejectedValue(new ApiError(401, "invalid_credentials", "x"));
    await render(<LoginScreen />);
    await type("Email", "ana@example.com");
    await type("Password", "wrong-pass1");
    await press("Sign in");
    expect(await screen.findByText("Incorrect email or password.")).toBeTruthy();
  });

  it("un fallo de red se explica sin tecnicismos", async () => {
    mockAuth.login.mockRejectedValue(new ApiError(0, "network_error", "Network error"));
    await render(<LoginScreen />);
    await type("Email", "a@a.io");
    await type("Password", "x");
    await press("Sign in");
    expect(await screen.findByText("Cannot reach the server. Check your connection.")).toBeTruthy();
  });

  it("permite probar la demo sin cuenta", async () => {
    mockAuth.demo.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    await press("Try the demo");
    await waitFor(() => expect(mockAuth.demo).toHaveBeenCalledTimes(1));
  });

  it("cambia al registro, exige el nombre y crea la cuenta", async () => {
    mockAuth.register.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    await press("No account yet? Create one");
    expect(screen.getByLabelText("Name")).toBeTruthy();
    await type("Email", "mo@example.com");
    await type("Password", "Sup3rsecret!");
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled(); // falta el nombre
    await type("Name", "Mo");
    await press("Create account");
    await waitFor(() => expect(mockAuth.register).toHaveBeenCalledWith("Mo", "mo@example.com", "Sup3rsecret!"));
  });
});
