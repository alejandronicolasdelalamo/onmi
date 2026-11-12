import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import {
  browserTimeZone,
  currentSubscription,
  disablePush,
  enablePush,
  PushError,
  pushSupported,
} from "@/lib/push";
import { needsIOSInstall } from "@/lib/platform";
import { InstallSteps } from "@/components/install-guide";
import type { PushStatus } from "@/lib/types";

/** Activar o desactivar los recordatorios de hábitos (Web Push) en este dispositivo. */
export function RemindersCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const supported = pushSupported();

  const status = useQuery({
    queryKey: ["push", "status"],
    queryFn: () => api.get<PushStatus>("/api/push/status"),
  });
  const local = useQuery({
    queryKey: ["push", "local"],
    queryFn: async () => (await currentSubscription()) !== null,
    enabled: supported,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["push"] });
  };

  const enable = useMutation({
    mutationFn: async (publicKey: string) => {
      const sub = await enablePush(publicKey);
      await api.post("/api/push/subscribe", {
        endpoint: sub.endpoint,
        keys: sub.keys,
        timezone: browserTimeZone(),
      });
    },
    onSuccess: () => {
      toast.success(t("reminders.enabledToast"));
      refresh();
    },
    onError: (e) =>
      toast.error(
        e instanceof PushError && e.reason === "denied"
          ? t("reminders.blocked")
          : errorMessage(e, t),
      ),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const endpoint = await disablePush();
      if (endpoint) await api.post("/api/push/unsubscribe", { endpoint });
    },
    onSuccess: () => {
      toast.success(t("reminders.disabledToast"));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const test = useMutation({
    mutationFn: () => api.post<{ sent: number }>("/api/push/test"),
    onSuccess: ({ sent }) =>
      sent > 0
        ? toast.success(t("reminders.testSent"))
        : toast.error(t("reminders.testFailed")),
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const publicKey = status.data?.public_key ?? null;
  const subscribed = local.data === true;
  const denied =
    supported &&
    typeof Notification !== "undefined" &&
    Notification.permission === "denied";

  let body: React.ReactNode;
  if (!supported && needsIOSInstall())
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("install.why")}</p>
        <InstallSteps />
      </div>
    );
  else if (!supported)
    body = (
      <p className="text-sm text-muted-foreground">
        {t("reminders.unsupported")}
      </p>
    );
  else if (status.isPending) body = null;
  else if (!publicKey)
    body = (
      <p className="text-sm text-muted-foreground">
        {t("reminders.notConfigured")}
      </p>
    );
  else if (denied && !subscribed)
    body = (
      <p className="text-sm text-muted-foreground">{t("reminders.blocked")}</p>
    );
  else if (subscribed)
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("reminders.enabled")}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            {t("reminders.test")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => disable.mutate()}
            disabled={disable.isPending}
          >
            {t("reminders.disable")}
          </Button>
        </div>
      </div>
    );
  else
    body = (
      <Button
        onClick={() => enable.mutate(publicKey)}
        disabled={enable.isPending}
      >
        <BellRing /> {t("reminders.enable")}
      </Button>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reminders.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("reminders.desc")}
        </p>
        {body}
      </CardContent>
    </Card>
  );
}
