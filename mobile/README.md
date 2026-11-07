# ONMi · app nativa

Cliente móvil (iOS y Android) de ONMi con **Expo SDK 58 + React Native + TypeScript**. Usa la misma API que la web.

**Qué incluye:** acceso con correo o demo, pantalla **Hoy** (saludo, ánimo, hábitos del día con marcado instantáneo),
**Hábitos** (diarios o con objetivo semanal, crear y borrar), **Notas** (búsqueda, crear, editar, borrar) y **Ajustes**.
Modo claro/oscuro según el sistema y textos en inglés y español según el idioma del dispositivo.

## Cómo ejecutarla

Necesitas el backend en marcha (véase el README de la raíz) y Node 20+.

```bash
cd mobile
npm install
cp .env.example .env          # y ajusta EXPO_PUBLIC_API_URL
npx expo start                # escanea el QR con Expo Go, o pulsa a (Android) / i (iOS)
```

`EXPO_PUBLIC_API_URL` es la URL del backend:

| Dónde corre la app | Valor |
| --- | --- |
| Emulador de Android | `http://10.0.2.2:5000` (valor por defecto) |
| Simulador de iOS | `http://localhost:5000` (valor por defecto) |
| Móvil físico en la misma wifi | `http://<IP-de-tu-equipo>:5000` (arranca Flask con `flask run -h 0.0.0.0`) |
| Producción | `https://tu-dominio` (HTTPS obligatorio en iOS y recomendable en Android) |

## Cómo funciona la sesión

El navegador usa cookies `httpOnly` con CSRF; una app nativa no tiene cookies, así que usa **tokens Bearer** con estas reglas:

- Se piden enviando `X-Client: mobile`; el servidor solo entonces devuelve `access_token` y `refresh_token` en el cuerpo.
- Se guardan en el **almacén seguro del sistema** (`expo-secure-store`: Keychain en iOS, Keystore en Android), nunca en `AsyncStorage`.
- Si una petición recibe 401 (access token caducado), el cliente renueva con el refresh token **una sola vez aunque fallen varias a la vez** y reintenta. Si el refresh también falla, cierra la sesión.
- Las cabeceras `Authorization` no las envían solos los navegadores, así que no hay riesgo de CSRF; el backend tiene un test que garantiza que las sesiones por cookie siguen exigiendo CSRF.

> Limitación conocida: los tokens son sin estado, por lo que "cerrar sesión" borra los tokens del dispositivo pero no los revoca en el servidor
> (el access token dura 15 minutos). Una lista de revocación sería el siguiente paso si hiciera falta.

## Calidad

```bash
npm run typecheck        # TypeScript estricto
npm test                 # 26 tests (Jest + Testing Library): cliente API, renovación de sesión, pantalla de acceso, traducciones
npm run export:android   # compila el bundle con Metro (valida todo el grafo de imports y las dependencias nativas)
npm run doctor           # expo-doctor: configuración y compatibilidad de dependencias
```

Buenas prácticas aplicadas: listas con `FlashList` y filas memoizadas con callbacks estables, `Pressable`, áreas seguras,
objetivos táctiles de 48 pt, actualización optimista con vuelta atrás y textos accesibles (`accessibilityRole` / `accessibilityState`).

### Qué está verificado y qué no

Verificado en este repositorio: tipos, 26 tests, el bundle de **iOS y Android** compila y `expo-doctor` pasa 20/20 comprobaciones.
**No se ha ejecutado en un dispositivo ni en un emulador** (el entorno de desarrollo no los tenía): conviene una primera pasada manual.

## Compilar e instalar

Las compilaciones se hacen en la nube con [EAS](https://docs.expo.dev/eas/) (no hace falta Xcode ni Android Studio), con tu cuenta de Expo:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android   # APK instalable para probar
npx eas-cli@latest build --profile production --platform all    # para las tiendas
```

El `bundleIdentifier` y el `package` (`app.onmi.mobile`) están en `app.json`; cámbialos por uno que controles antes de publicar.
