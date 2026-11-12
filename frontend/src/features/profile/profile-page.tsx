import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, MailWarning } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAuth, usePublicConfig, useSetLanguage } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import i18n, { LANGUAGES } from "@/lib/i18n";
import { ACCENTS, useTheme, type Theme } from "@/lib/theme";
import { BackupCard, SessionsCard } from "./backup-sessions";
import { PasskeysCard } from "./passkeys-card";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AvatarGif } from "@/features/mood/mood-page";

import { PasswordInput } from "@/components/ui/password-input";
import { AiCoachCard } from "./ai-coach-card";
import { RemindersCard } from "./reminders-card";
const AVATARS = ["male", "female", "prefer_not_to_say"] as const;

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md bg-muted p-0.5 text-sm"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-[5px] px-3 py-1 font-medium text-muted-foreground transition-colors",
            value === o.value && "bg-card text-foreground shadow-xs",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const schema = useMemo(
    () =>
      z.object({
        current_password: z.string().min(1, t("errors.required")),
        new_password: z
          .string()
          .min(8, t("errors.passwordWeak"))
          .refine(
            (v) => !/^[A-Za-z]+$/.test(v) && !/^\d+$/.test(v),
            t("errors.passwordWeak"),
          ),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "" },
  });
  const m = useMutation({
    mutationFn: (v: { current_password: string; new_password: string }) =>
      api.post("/api/auth/change-password", v),
    onSuccess: () => {
      toast.success(t("profile.passwordUpdated"));
      form.reset();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const { errors } = form.formState;
  return (
    <form
      onSubmit={form.handleSubmit((v) => m.mutate(v))}
      className="space-y-4"
      noValidate
    >
      <Field
        label={t("profile.currentPassword")}
        error={errors.current_password?.message}
      >
        {(p) => (
          <PasswordInput
            autoComplete="current-password"
            {...p}
            {...form.register("current_password")}
          />
        )}
      </Field>
      <Field
        label={t("profile.newPassword")}
        hint={t("auth.passwordHint")}
        error={errors.new_password?.message}
      >
        {(p) => (
          <PasswordInput
            autoComplete="new-password"
            {...p}
            {...form.register("new_password")}
          />
        )}
      </Field>
      <Button type="submit" disabled={m.isPending}>
        {t("profile.changePassword")}
      </Button>
    </form>
  );
}

function DeleteAccount() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const m = useMutation({
    mutationFn: () => api.delete("/api/auth/me"),
    onSuccess: async () => {
      await logout();
      navigate("/login", { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {t("profile.deleteAccount")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t("profile.deleteAccount")}
          description={t("profile.deleteWarning")}
        >
          <Field label={t("profile.deleteConfirmLabel")}>
            {(p) => (
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                {...p}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={text !== "DELETE" || m.isPending}
              onClick={() => m.mutate()}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const setLanguage = useSetLanguage();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const { data: config } = usePublicConfig();

  const patch = useMutation({
    mutationFn: (
      body: Partial<Pick<User, "name" | "avatar" | "locale" | "bio">>,
    ) => api.patch<{ user: User }>("/api/auth/me", body),
    onSuccess: ({ user }) => {
      setUser(user);
      toast.success(t("common.saved"));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (!user) return null;
  const lang = i18n.language?.startsWith("es") ? "es" : "en";

  return (
    <Page className="max-w-3xl">
      <PageHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />
      {user.is_demo && (
        <p className="mb-4 rounded-md bg-warning/15 px-3 py-2 text-sm">
          {t("profile.demoNotice")}
        </p>
      )}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.account")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && name.trim() !== user.name)
                  patch.mutate({ name: name.trim() });
              }}
            >
              <Field className="flex-1" label={t("profile.name")}>
                {(p) => (
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    {...p}
                  />
                )}
              </Field>
              <Button
                type="submit"
                disabled={
                  patch.isPending || !name.trim() || name.trim() === user.name
                }
              >
                {t("common.save")}
              </Button>
            </form>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (bio.trim() !== user.bio) patch.mutate({ bio: bio.trim() });
              }}
            >
              <Field
                className="flex-1"
                label={t("profile.bio")}
                hint={t("profile.bioHint")}
              >
                {(p) => (
                  <Input
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={160}
                    placeholder={t("profile.bioPlaceholder")}
                    {...p}
                  />
                )}
              </Field>
              <Button
                type="submit"
                disabled={patch.isPending || bio.trim() === user.bio}
              >
                {t("common.save")}
              </Button>
            </form>
            <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
              <span>{user.email}</span>
              {!config?.mail_enabled ? null : user.email_verified ? (
                <Badge tone="success">
                  <BadgeCheck className="size-3" /> {t("profile.emailVerified")}
                </Badge>
              ) : (
                <Badge tone="warning">
                  <MailWarning className="size-3" />{" "}
                  {t("profile.emailUnverified")}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("profile.preferences")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("profile.avatar")}</p>
              <div
                className="flex flex-wrap gap-3"
                role="radiogroup"
                aria-label={t("profile.avatar")}
              >
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    role="radio"
                    aria-checked={(user.avatar ?? "prefer_not_to_say") === a}
                    onClick={() => patch.mutate({ avatar: a })}
                    className={cn(
                      "cursor-pointer space-y-1.5 rounded-xl border-2 p-2 text-xs font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:-translate-y-0.5",
                      (user.avatar ?? "prefer_not_to_say") === a
                        ? "border-primary bg-accent"
                        : "border-transparent bg-muted/60",
                    )}
                  >
                    <AvatarGif avatar={a} mood="neutral" className="size-20" />
                    {t(`profile.avatars.${a}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("common.language")}</p>
                <Segmented
                  label={t("common.language")}
                  value={lang}
                  options={LANGUAGES.map((l) => ({
                    value: l,
                    label: l === "en" ? "English" : "Español",
                  }))}
                  onChange={(l) => {
                    setLanguage(l);
                  }}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("common.theme")}</p>
                <Segmented<Theme>
                  label={t("common.theme")}
                  value={theme}
                  options={[
                    { value: "light", label: t("common.light") },
                    { value: "dark", label: t("common.dark") },
                    { value: "midnight", label: t("common.midnight") },
                    { value: "system", label: t("common.system") },
                  ]}
                  onChange={setTheme}
                />
                {theme === "midnight" && (
                  <p className="text-xs text-muted-foreground">
                    {t("common.midnightHint")}
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium" id="accent-label">
                  {t("common.accent")}
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby="accent-label"
                  className="flex flex-wrap gap-2.5"
                >
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={accent === a}
                      aria-label={t(`common.accents.${a}`)}
                      title={t(`common.accents.${a}`)}
                      onClick={() => setAccent(a)}
                      data-accent={a === "indigo" ? undefined : a}
                      className={cn(
                        "size-9 cursor-pointer rounded-full bg-primary transition-transform active:scale-90 pointer-coarse:size-11",
                        accent === a
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                          : "opacity-80 hover:opacity-100",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <RemindersCard />

        <AiCoachCard />

        <BackupCard />

        {!user.is_demo && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.security")}</CardTitle>
              </CardHeader>
              <CardContent>
                {user.has_password ? (
                  <PasswordForm />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("profile.noPassword")}
                  </p>
                )}
              </CardContent>
            </Card>
            <PasskeysCard />
            <SessionsCard />
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive">
                  {t("profile.danger")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("profile.deleteWarning")}
                </p>
                <DeleteAccount />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}
