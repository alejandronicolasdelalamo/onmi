import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  HabitEditor: undefined;
  NoteEditor: { id?: number } | undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
export type NoteEditorProps = NativeStackScreenProps<RootStackParamList, "NoteEditor">;
