import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { AuthLayout } from "./auth-layout";
import { SocialSection } from "./social-section";

function useSchemas() {
  const { t } = useTranslation();
  return useMemo(() => {
    const email = z
      .string()
      .min(1, t("errors.required"))
      .email(t("errors.invalidEmail"));
    const password = z
      .string()
      .min(8, t("errors.passwordWeak"))
      .refine(
        (v) => !/^[A-Za-z]+$/.test(v) && !/^\d+$/.test(v),
        t("errors.passwordWeak"),
      );
    return {
      login: z.object({
        email,
        password: z.string().min(1, t("errors.required")),
      }),
      register: z.object({
        name: z.string().trim().min(1, t("errors.required")),
        email,
        password,
      }),
      forgot: z.object({ email }),
      reset: z.object({ password }),
    };
  }, [t]);
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const schemas = useSchemas();
  const form = useForm({
    resolver: zodResolver(schemas.login),
    defaultValues: { email: "", password: "" },
  });
  const m = useMutation({
    mutationFn: (v: { email: string; password: string }) =>
      login(v.email, v.password),
    onSuccess: () => navigate("/", { replace: true }),
  });
  const { errors } = form.formState;

  return (
    <AuthLayout
      title={t("auth.welcomeBack")}
      description={t("auth.welcomeBackDesc")}
    >
      <form
        onSubmit={form.handleSubmit((v) => m.mutate(v))}
        className="space-y-4"
        noValidate
      >
        <FormError message={m.error ? errorMessage(m.error, t) : undefined} />
        <Field label={t("auth.email")} error={errors.email?.message}>
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              {...p}
              {...form.register("email")}
            />
          )}
        </Field>
        <Field label={t("auth.password")} error={errors.password?.message}>
          {(p) => (
            <Input
              type="password"
              autoComplete="current-password"
              {...p}
              {...form.register("password")}
            />
          )}
        </Field>
        <div className="text-right">
          <Link
            to="/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            {t("auth.forgot")}
          </Link>
        </div>
        <SubmitButton pending={m.isPending}>{t("auth.signIn")}</SubmitButton>
      </form>
      <SocialSection />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link
          to="/register"
          className="font-medium text-primary hover:underline"
        >
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const schemas = useSchemas();
  const form = useForm({
    resolver: zodResolver(schemas.register),
    defaultValues: { name: "", email: "", password: "" },
  });
  const m = useMutation({
    mutationFn: (v: { name: string; email: string; password: string }) =>
      signUp(v.name, v.email, v.password),
    onSuccess: () => navigate("/", { replace: true }),
  });
  const { errors } = form.formState;
  const server = fieldErrors(m.error);

  return (
    <AuthLayout
      title={t("auth.createTitle")}
      description={t("auth.createDesc")}
    >
      <form
        onSubmit={form.handleSubmit((v) => m.mutate(v))}
        className="space-y-4"
        noValidate
      >
        <FormError
          message={
            m.error && !(m.error instanceof ApiError && m.error.status === 422)
              ? errorMessage(m.error, t)
              : undefined
          }
        />
        <Field
          label={t("auth.name")}
          error={errors.name?.message ?? server.name}
        >
          {(p) => (
            <Input
              autoComplete="name"
              autoFocus
              {...p}
              {...form.register("name")}
            />
          )}
        </Field>
        <Field
          label={t("auth.email")}
          error={errors.email?.message ?? server.email}
        >
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              {...p}
              {...form.register("email")}
            />
          )}
        </Field>
        <Field
          label={t("auth.password")}
          hint={t("auth.passwordHint")}
          error={errors.password?.message ?? server.password}
        >
          {(p) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...p}
              {...form.register("password")}
            />
          )}
        </Field>
        <SubmitButton pending={m.isPending}>{t("auth.signUp")}</SubmitButton>
      </form>
      <SocialSection />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const schemas = useSchemas();
  const form = useForm({
    resolver: zodResolver(schemas.forgot),
    defaultValues: { email: "" },
  });
  const m = useMutation({
    mutationFn: (v: { email: string }) =>
      api.post("/api/auth/forgot-password", v),
  });
  const { errors } = form.formState;

  return (
    <AuthLayout
      title={t("auth.forgotTitle")}
      description={t("auth.forgotDesc")}
    >
      {m.isSuccess ? (
        <p
          role="status"
          className="rounded-md bg-success/10 px-3 py-3 text-sm text-success"
        >
          {t("auth.linkSent")}
        </p>
      ) : (
        <form
          onSubmit={form.handleSubmit((v) => m.mutate(v))}
          className="space-y-4"
          noValidate
        >
          <FormError message={m.error ? errorMessage(m.error, t) : undefined} />
          <Field label={t("auth.email")} error={errors.email?.message}>
            {(p) => (
              <Input
                type="email"
                autoComplete="email"
                autoFocus
                {...p}
                {...form.register("email")}
              />
            )}
          </Field>
          <SubmitButton pending={m.isPending}>
            {t("auth.sendLink")}
          </SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="text-primary hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const schemas = useSchemas();
  const form = useForm({
    resolver: zodResolver(schemas.reset),
    defaultValues: { password: "" },
  });
  const m = useMutation({
    mutationFn: (v: { password: string }) =>
      api.post("/api/auth/reset-password", { token, password: v.password }),
    onSuccess: () => {
      toast.success(t("auth.resetDone"));
      navigate("/login", { replace: true });
    },
  });
  const { errors } = form.formState;

  return (
    <AuthLayout title={t("auth.resetTitle")}>
      {!token ? (
        <FormError message={t("auth.resetMissing")} />
      ) : (
        <form
          onSubmit={form.handleSubmit((v) => m.mutate(v))}
          className="space-y-4"
          noValidate
        >
          <FormError
            message={
              m.error instanceof ApiError && m.error.code === "invalid_token"
                ? t("errors.invalid_token_link")
                : m.error
                  ? errorMessage(m.error, t)
                  : undefined
            }
          />
          <Field
            label={t("auth.newPassword")}
            hint={t("auth.passwordHint")}
            error={errors.password?.message}
          >
            {(p) => (
              <Input
                type="password"
                autoComplete="new-password"
                autoFocus
                {...p}
                {...form.register("password")}
              />
            )}
          </Field>
          <SubmitButton pending={m.isPending}>{t("common.save")}</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const m = useMutation({
    mutationFn: () => api.post("/api/auth/verify-email", { token }),
  });

  useEffect(() => {
    if (token)
      m.mutate(undefined, {
        onSuccess: () => user && setUser({ ...user, email_verified: true }),
      });
    // Solo una vez por token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const state = !token || m.isError ? "error" : m.isSuccess ? "ok" : "loading";

  return (
    <AuthLayout title={t("auth.verifyTitle")}>
      <div className="flex items-center gap-3 text-sm" role="status">
        {state === "loading" && (
          <>
            <Loader2 className="size-5 animate-spin text-primary" />{" "}
            {t("auth.verifying")}
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="size-5 text-success" />{" "}
            {t("auth.verified")}
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="size-5 text-destructive" />{" "}
            {t("auth.verifyFailed")}
          </>
        )}
      </div>
      <Button asChild className="mt-6 w-full">
        <Link to={user ? "/" : "/login"}>
          {user ? t("nav.dashboard") : t("auth.signIn")}
        </Link>
      </Button>
    </AuthLayout>
  );
}
