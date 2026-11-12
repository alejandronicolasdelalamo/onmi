import { getLocales } from "expo-localization";

const en = {
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.save": "Save",
  "common.retry": "Try again",
  "common.loading": "Loading…",
  "tabs.today": "Today",
  "tabs.habits": "Habits",
  "tabs.notes": "Notes",
  "tabs.settings": "Settings",
  "auth.title": "Welcome to ONMi",
  "auth.subtitle": "Notes, habits and focus in one place.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name",
  "auth.signIn": "Sign in",
  "auth.signUp": "Create account",
  "auth.demo": "Try the demo",
  "auth.toRegister": "No account yet? Create one",
  "auth.toLogin": "Already have an account? Sign in",
  "auth.signOut": "Sign out",
  "auth.signOutConfirm": "Sign out of ONMi on this device?",
  "today.morning": "Good morning",
  "today.afternoon": "Good afternoon",
  "today.evening": "Good evening",
  "today.habits": "Habits today",
  "today.streak": "Best streak",
  "today.focus": "Focus today",
  "today.mood": "How are you feeling?",
  "today.noHabits": "No habits yet. Add one in the Habits tab.",
  "today.minutes": "{{count}} min",
  "today.days": "{{count}} days",
  "habits.add": "New habit",
  "habits.name": "Name",
  "habits.frequency": "How often",
  "habits.daily": "Every day",
  "habits.weekly": "{{count}}× a week",
  "habits.empty": "You have no habits yet.",
  "habits.weekProgress": "{{done}} of {{target}} this week",
  "habits.deleteTitle": "Delete “{{name}}”?",
  "habits.deleteBody": "Its history and streaks will be deleted.",
  "habits.markDone": "Mark {{name}} as done",
  "habits.markUndone": "Mark {{name}} as not done",
  "notes.search": "Search notes",
  "notes.hidden": "Hidden note",
  "notes.hiddenHint": "Unlock it on the web to read it.",
  "notes.new": "New note",
  "notes.title": "Title",
  "notes.content": "Write something…",
  "notes.empty": "No notes yet.",
  "notes.deleteTitle": "Delete this note?",
  "notes.deleteBody": "This cannot be undone.",
  "settings.account": "Account",
  "settings.server": "Server",
  "settings.demoNote": "You are using the shared demo account.",
  "mood.happy": "Happy",
  "mood.love": "Loved",
  "mood.neutral": "Neutral",
  "mood.mad": "Angry",
  "mood.sad": "Sad",
  "errors.generic": "Something went wrong. Please try again.",
  "errors.network_error": "Cannot reach the server. Check your connection.",
  "errors.invalid_credentials": "Incorrect email or password.",
  "errors.locked": "Too many failed attempts. Try again in a few minutes.",
  "errors.email_taken": "An account with that email already exists.",
  "errors.validation_error": "Please check the fields and try again.",
  "errors.rate_limited": "Too many attempts. Please wait a moment.",
} as const;

export type Key = keyof typeof en;

const es: Record<Key, string> = {
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.save": "Guardar",
  "common.retry": "Reintentar",
  "common.loading": "Cargando…",
  "tabs.today": "Hoy",
  "tabs.habits": "Hábitos",
  "tabs.notes": "Notas",
  "tabs.settings": "Ajustes",
  "auth.title": "Bienvenido a ONMi",
  "auth.subtitle": "Notas, hábitos y enfoque en un solo lugar.",
  "auth.email": "Correo electrónico",
  "auth.password": "Contraseña",
  "auth.name": "Nombre",
  "auth.signIn": "Iniciar sesión",
  "auth.signUp": "Crear cuenta",
  "auth.demo": "Probar la demo",
  "auth.toRegister": "¿No tienes cuenta? Crea una",
  "auth.toLogin": "¿Ya tienes cuenta? Inicia sesión",
  "auth.signOut": "Cerrar sesión",
  "auth.signOutConfirm": "¿Cerrar la sesión de ONMi en este dispositivo?",
  "today.morning": "Buenos días",
  "today.afternoon": "Buenas tardes",
  "today.evening": "Buenas noches",
  "today.habits": "Hábitos de hoy",
  "today.streak": "Mejor racha",
  "today.focus": "Enfoque hoy",
  "today.mood": "¿Cómo te sientes?",
  "today.noHabits": "Aún no hay hábitos. Añade uno en la pestaña Hábitos.",
  "today.minutes": "{{count}} min",
  "today.days": "{{count}} días",
  "habits.add": "Nuevo hábito",
  "habits.name": "Nombre",
  "habits.frequency": "Frecuencia",
  "habits.daily": "Todos los días",
  "habits.weekly": "{{count}}× por semana",
  "habits.empty": "Aún no tienes hábitos.",
  "habits.weekProgress": "{{done}} de {{target}} esta semana",
  "habits.deleteTitle": "¿Eliminar «{{name}}»?",
  "habits.deleteBody": "Se borrarán su historial y sus rachas.",
  "habits.markDone": "Marcar {{name}} como hecho",
  "habits.markUndone": "Marcar {{name}} como no hecho",
  "notes.search": "Buscar notas",
  "notes.hidden": "Nota oculta",
  "notes.hiddenHint": "Desbloquéala en la web para leerla.",
  "notes.new": "Nueva nota",
  "notes.title": "Título",
  "notes.content": "Escribe algo…",
  "notes.empty": "Aún no hay notas.",
  "notes.deleteTitle": "¿Eliminar esta nota?",
  "notes.deleteBody": "Esta acción no se puede deshacer.",
  "settings.account": "Cuenta",
  "settings.server": "Servidor",
  "settings.demoNote": "Estás usando la cuenta demo compartida.",
  "mood.happy": "Feliz",
  "mood.love": "Querido",
  "mood.neutral": "Neutral",
  "mood.mad": "Enfadado",
  "mood.sad": "Triste",
  "errors.generic": "Algo ha salido mal. Inténtalo de nuevo.",
  "errors.network_error": "No se puede conectar con el servidor. Revisa tu conexión.",
  "errors.invalid_credentials": "Correo o contraseña incorrectos.",
  "errors.locked": "Demasiados intentos fallidos. Prueba de nuevo en unos minutos.",
  "errors.email_taken": "Ya existe una cuenta con ese correo.",
  "errors.validation_error": "Revisa los campos e inténtalo de nuevo.",
  "errors.rate_limited": "Demasiados intentos. Espera un momento.",
};

export const dictionaries = { en: en as Record<Key, string>, es };
export type Lang = keyof typeof dictionaries;

export function deviceLang(): Lang {
  try {
    return getLocales()[0]?.languageCode === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

let lang: Lang = deviceLang();
export const setLang = (l: Lang) => {
  lang = l;
};

/** Traduce una clave con variables `{{nombre}}`. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const text = dictionaries[lang][key] ?? dictionaries.en[key];
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ""));
}

/** Mensaje traducido para un error de la API por su `code` estable. */
export function errorText(code: string | undefined): string {
  const key = `errors.${code}` as Key;
  return key in dictionaries.en ? t(key) : t("errors.generic");
}
