import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import type { CoachStatus, User } from "@/lib/types";

/**
 * Consentimiento del coach con IA. Solo aparece si el servidor tiene clave de Claude.
 * Muestra con exactitud qué datos se envían y cuáles nunca.
 */
export function AiCoachCard() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const status = useQuery({
    queryKey: ["coach", "status"],
    queryFn: () => api.get<CoachStatus>("/api/coach/status"),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<{ user: User }>("/api/auth/me", { ai_coach_enabled: enabled }),
    onSuccess: ({ user }) => {
      setUser(user);
      toast.success(
        user.ai_coach_enabled
          ? t("aiCoach.enabledToast")
          : t("aiCoach.disabledToast"),
      );
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (!user || !status.data?.ai_available) return null;
  const { can_enable: canEnable, model } = status.data;

  return (
    <Card id="ai-coach" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t("aiCoach.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("aiCoach.desc")}
        </p>
        <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium">
          {t("aiCoach.toggle")}
          <Switch
            checked={user.ai_coach_enabled}
            disabled={!canEnable || toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
          />
        </label>
        {!canEnable && (
          <p className="text-sm text-muted-foreground">{t("aiCoach.demo")}</p>
        )}
        <dl className="grid gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">{t("aiCoach.sentTitle")}</dt>
            <dd className="mt-1 text-muted-foreground">{t("aiCoach.sent")}</dd>
          </div>
          <div>
            <dt className="font-medium">{t("aiCoach.neverTitle")}</dt>
            <dd className="mt-1 text-muted-foreground">{t("aiCoach.never")}</dd>
          </div>
        </dl>
        {model && (
          <p className="text-xs text-muted-foreground">
            {t("aiCoach.provider", { model })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
