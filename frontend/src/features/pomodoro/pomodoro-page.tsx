import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
} from "recharts";
import { toast } from "sonner";
import { Page, PageHeader, Stat } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { usePomodoroStats, useProjects, useSaveSession } from "@/lib/queries";
import { cn, formatDuration } from "@/lib/utils";
import {
  beep,
  loadRun,
  loadSettings,
  saveSettings,
  usePomodoro,
  type PomodoroSettings,
} from "./use-pomodoro";
import { IosSilenceGuide, isIOS } from "./ios-silence-guide";
import { isMobileDevice, SilenceReminder } from "./silence-reminder";
import { enterFullscreen, exitFullscreen, FocusLock } from "./focus-lock";

/** Las llamadas de inicio/fin del modo enfoque van en fila para que nunca lleguen desordenadas. */
let focusQueue: Promise<unknown> = Promise.resolve();
function syncFocus(call: () => Promise<unknown>) {
  focusQueue = focusQueue.then(call).catch(() => {});
}

function Ring({
  progress,
  mode,
  children,
}: {
  progress: number;
  mode: "work" | "break";
  children: React.ReactNode;
}) {
  const r = 108;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto grid size-64 place-items-center">
      <svg
        viewBox="0 0 240 240"
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx="120"
          cy="120"
          r={r}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <circle
          cx="120"
          cy="120"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className={cn(
            "transition-[stroke-dashoffset] duration-300",
            mode === "work" ? "stroke-primary" : "stroke-success",
          )}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

export function PomodoroPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings);
  const [projectId, setProjectId] = useState("");
  const { data: projects = [] } = useProjects();
  const { data: stats } = usePomodoroStats();
  const save = useSaveSession();
  const [reminding, setReminding] = useState(false);
  const [interruptions, setInterruptions] = useState(0);
  const interruptionsRef = useRef(0);

  const timer = usePomodoro({
    settings,
    onComplete: ({ mode, seconds }) => {
      save.mutate({
        kind: mode,
        duration_seconds: seconds,
        completed: true,
        project_id: projectId ? Number(projectId) : null,
      });
      const msg =
        mode === "work" ? t("pomodoro.workDone") : t("pomodoro.breakDone");
      exitFullscreen();
      const outs = interruptionsRef.current;
      toast.success(msg, {
        description:
          mode === "work" && settings.lock && outs
            ? t("pomodoro.lock.interruptions", { count: outs })
            : undefined,
      });
      if (settings.sound) beep();
      if (
        settings.notifications &&
        "Notification" in window &&
        Notification.permission === "granted"
      )
        new Notification("ONMi", { body: msg });
    },
  });

  useEffect(() => saveSettings(settings), [settings]);

  // Modo bloqueo: solo en los intervalos de enfoque (el descanso es para soltar el móvil... o usarlo).
  const locked = settings.lock && timer.running && timer.mode === "work";

  useEffect(() => {
    if (!locked) return;
    // El servidor deja de mandar notificaciones push hasta esa hora (con 1 min de margen).
    const run = loadRun();
    const left = run
      ? Math.ceil((run.endAt - Date.now()) / 1000)
      : settings.workMinutes * 60;
    syncFocus(() =>
      api.put("/api/pomodoro/focus", {
        seconds: Math.min(125 * 60, Math.max(1, left + 60)),
      }),
    );
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        interruptionsRef.current += 1;
        setInterruptions(interruptionsRef.current);
      }
    };
    // Recargar o cerrar la pestaña pide confirmación (y si se recarga, el bloqueo vuelve igualmente).
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      syncFocus(() => api.delete("/api/pomodoro/focus"));
    };
    // Solo al entrar o salir del bloqueo; los minutos no cambian con la sesión en marcha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const begin = () => {
    if (settings.lock && timer.mode === "work") {
      // Una sesión nueva empieza con el contador de salidas a cero; al reanudar se conserva.
      if (timer.remaining === timer.total) {
        interruptionsRef.current = 0;
        setInterruptions(0);
      }
      enterFullscreen(); // necesita el gesto del usuario, por eso va aquí y no en un efecto
    }
    timer.start();
  };

  const start = () => {
    // Solo antes de un enfoque nuevo con bloqueo, en móvil; al reanudar no se vuelve a preguntar.
    if (
      settings.lock &&
      settings.silenceReminder &&
      timer.mode === "work" &&
      timer.remaining === timer.total &&
      isMobileDevice()
    ) {
      setReminding(true);
      return;
    }
    begin();
  };

  const abandon = () => {
    if (timer.elapsed >= 60)
      save.mutate({
        kind: "work",
        duration_seconds: timer.elapsed,
        completed: false,
        project_id: projectId ? Number(projectId) : null,
      });
    timer.reset();
    exitFullscreen();
    toast(t("pomodoro.lock.abandoned"));
  };

  // El tiempo restante en la pestaña del navegador.
  useEffect(() => {
    document.title = timer.running
      ? `${formatDuration(timer.remaining)} · ONMi`
      : "ONMi";
    return () => {
      document.title = "ONMi";
    };
  }, [timer.running, timer.remaining]);

  const update = (patch: Partial<PomodoroSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));
  const progress = 1 - timer.remaining / timer.total;

  const toggleNotifications = async (on: boolean) => {
    if (
      on &&
      "Notification" in window &&
      Notification.permission !== "granted"
    ) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    update({ notifications: on });
  };

  return (
    <Page>
      <PageHeader
        title={t("pomodoro.title")}
        subtitle={t("pomodoro.subtitle")}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="space-y-6 py-8">
            <div
              className="flex justify-center gap-1 rounded-full bg-muted p-1 text-sm font-medium sm:mx-auto sm:w-fit"
              aria-hidden
            >
              {(["work", "break"] as const).map((m) => (
                <span
                  key={m}
                  className={cn(
                    "rounded-full px-4 py-1",
                    timer.mode === m && "bg-card shadow-xs",
                  )}
                >
                  {t(`pomodoro.${m}`)}
                </span>
              ))}
            </div>
            <Ring progress={progress} mode={timer.mode}>
              <p
                className="font-mono text-6xl font-semibold tabular-nums tracking-tight"
                role="timer"
                aria-live="off"
              >
                {formatDuration(timer.remaining)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`pomodoro.${timer.mode}`)}
              </p>
            </Ring>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={timer.reset}
                aria-label={t("pomodoro.reset")}
              >
                <RotateCcw />
              </Button>
              <Button
                size="lg"
                className="min-w-36"
                onClick={timer.running ? timer.pause : start}
              >
                {timer.running ? <Pause /> : <Play />}
                {timer.running
                  ? t("pomodoro.pause")
                  : timer.remaining < timer.total
                    ? t("pomodoro.resume")
                    : t("pomodoro.start")}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={timer.skip}
                aria-label={t("pomodoro.skip")}
              >
                <SkipForward />
              </Button>
            </div>
            <div className="mx-auto max-w-xs space-y-1.5">
              <Label htmlFor="pomo-project">{t("pomodoro.project")}</Label>
              <NativeSelect
                id="pomo-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">{t("pomodoro.noProject")}</option>
                {projects
                  .filter((p) => p.status !== "done")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={t("pomodoro.sessionsToday")}
              value={stats?.today_sessions ?? "–"}
            />
            <Stat
              label={t("pomodoro.minutesToday")}
              value={stats?.today_minutes ?? "–"}
            />
            <Stat
              label={t("pomodoro.week")}
              value={
                stats
                  ? t("pomodoro.minutesShort", { count: stats.week_minutes })
                  : "–"
              }
            />
            <Stat
              label={t("pomodoro.total")}
              value={stats?.total_sessions ?? "–"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("pomodoro.last14")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="h-32"
                role="img"
                aria-label={`${t("pomodoro.last14")}: ${t("pomodoro.minutesShort", { count: stats?.series.reduce((n, d) => n + d.minutes, 0) ?? 0 })}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    accessibilityLayer={false}
                    data={stats?.series ?? []}
                    margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                  >
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(8)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      interval={1}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)" }}
                      formatter={(v) => [
                        t("pomodoro.minutesShort", { count: Number(v) }),
                        "",
                      ]}
                      labelFormatter={(l) => String(l)}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="minutes"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("pomodoro.settings")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["workMinutes", 120],
                    ["breakMinutes", 60],
                  ] as const
                ).map(([key, max]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`pomo-${key}`}>
                      {t(`pomodoro.${key}`)}
                    </Label>
                    <Input
                      id={`pomo-${key}`}
                      type="number"
                      min={1}
                      max={max}
                      value={settings[key]}
                      disabled={timer.running}
                      onChange={(e) =>
                        update({
                          [key]: Math.min(
                            max,
                            Math.max(1, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <label className="flex cursor-pointer items-center justify-between text-sm">
                {t("pomodoro.sound")}
                <Switch
                  checked={settings.sound}
                  onCheckedChange={(v) => update({ sound: v })}
                />
              </label>
              <label className="flex cursor-pointer items-start justify-between gap-4 text-sm">
                <span>
                  {t("pomodoro.lock.setting")}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("pomodoro.lock.settingHint")}
                  </span>
                </span>
                <Switch
                  checked={settings.lock}
                  disabled={timer.running}
                  onCheckedChange={(v) => update({ lock: v })}
                />
              </label>
              {isMobileDevice() && (
                <label className="flex cursor-pointer items-center justify-between text-sm">
                  {t("pomodoro.reminder.setting")}
                  <Switch
                    checked={settings.silenceReminder}
                    onCheckedChange={(v) => update({ silenceReminder: v })}
                  />
                </label>
              )}
              {isIOS() && <IosSilenceGuide />}
              {"Notification" in window && (
                <label className="flex cursor-pointer items-center justify-between text-sm">
                  {t("pomodoro.notifications")}
                  <Switch
                    checked={settings.notifications}
                    onCheckedChange={(v) => void toggleNotifications(v)}
                  />
                </label>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <SilenceReminder
        open={reminding}
        onOpenChange={setReminding}
        onStart={(dontAsk) => {
          if (dontAsk) update({ silenceReminder: false });
          setReminding(false);
          begin();
        }}
      />
      {locked && (
        <FocusLock
          remaining={formatDuration(timer.remaining)}
          progress={progress}
          project={projects.find((p) => String(p.id) === projectId)?.name}
          interruptions={interruptions}
          onAbandon={abandon}
        />
      )}
    </Page>
  );
}
