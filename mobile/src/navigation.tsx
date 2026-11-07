import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "./auth";
import { t } from "./i18n";
import type { RootStackParamList } from "./navigation-types";
import { HabitEditorScreen, HabitsScreen } from "./screens/HabitsScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { NoteEditorScreen, NotesScreen } from "./screens/NotesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { useTheme } from "./theme";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

type IconName = keyof typeof Ionicons.glyphMap;
const TAB_ICONS: Record<string, [IconName, IconName]> = {
  Today: ["today", "today-outline"],
  Habits: ["checkmark-done-circle", "checkmark-done-circle-outline"],
  Notes: ["document-text", "document-text-outline"],
  Settings: ["settings", "settings-outline"],
};

function Tabs() {
  const c = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text },
        headerShadowVisible: false,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]![focused ? 0 : 1]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ title: t("tabs.today") }} />
      <Tab.Screen name="Habits" component={HabitsScreen} options={{ title: t("tabs.habits") }} />
      <Tab.Screen name="Notes" component={NotesScreen} options={{ title: t("tabs.notes") }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t("tabs.settings") }} />
    </Tab.Navigator>
  );
}

export function Navigation() {
  const c = useTheme();
  const { user, loading } = useAuth();
  const base = c.isDark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: c.primary, background: c.background, card: c.card, text: c.text, border: c.border } };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} accessibilityLabel={t("common.loading")} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: c.card }, headerTitleStyle: { color: c.text }, headerTintColor: c.primary }}>
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="HabitEditor" component={HabitEditorScreen} options={{ presentation: "modal", title: t("habits.add") }} />
            <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ presentation: "modal", title: t("notes.new") }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
