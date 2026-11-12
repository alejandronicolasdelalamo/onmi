import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, MonitorSmartphone, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseUtc } from "@/lib/format";
import { toast } from "sonner";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "@/lib/queries";
import { localISODate } from "@/lib/utils";

const LAST_BACKUP = "onmi.last-backup";

export function lastBackupDays(now = Date.now()): number | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP);
    if (!v) return null;
    return Math.max(0, Math.floor((now - Date.parse(v)) / 86_400_000));
  } catch {
    return null;
  }
}

interface ImportResult {
  notes: number;
  projects: number;
  goals: number;
  habits: number;
  moods: number;
  skipped: number;
}

/** Copia de seguridad: descargar todos los datos e importar una copia anterior (solo añade lo que falta). */
export function BackupCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState(() => lastBackupDays());

  const exportM = useMutation({
    mutationFn: async () => {
      const data = await api.get<unknown>("/api/auth/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `onmi-export-${localISODate()}.json`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      try {
        localStorage.setItem(LAST_BACKUP, new Date().toISOString());
      } catch {
        /* sin almacenamiento */
      }
      setDays(0);
      toast.success(t("profile.downloaded"));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const importM = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 5_000_000) throw new Error("too large");
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new Error("not json");
      }
      return api.post<ImportResult>("/api/backup/import", payload);
    },
    onSuccess: (r) => {
      void qc.invalidateQueries();
      const added = r.notes + r.projects + r.goals + r.habits + r.moods;
      toast.success(
        added > 0 ? t("backup.imported", { ...r }) : t("backup.nothingNew"),
      );
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && !("code" in e)
          ? t("backup.invalidFile")
          : errorMessage(e, t),
      ),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.data")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("backup.desc")}
        </p>
        <p className="text-xs text-muted-foreground">
          {days === null
            ? t("backup.never")
            : days === 0
              ? t("backup.today")
              : t("backup.daysAgo", { count: days })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportM.mutate()}
            disabled={exportM.isPending}
          >
            <Download /> {t("profile.download")}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importM.isPending}
          >
            <Upload /> {t("backup.import")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importM.mutate(f);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ago(iso: string, lang: string) {
  const mins = Math.round((Date.now() - parseUtc(iso)) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (mins < 1) return rtf.format(0, "minute");
  if (mins < 60) return rtf.format(-mins, "minute");
  if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), "hour");
  return rtf.format(-Math.round(mins / 60 / 24), "day");
}

/** Dispositivos con la sesión abierta, para cerrar los que ya no uses. */
export function SessionsCard() {
  const { t, i18n } = useTranslation();
  const { data, isPending } = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const items = data ?? [];
  const others = items.filter((s) => !s.current).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sessions.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("sessions.desc")}
        </p>
        {isPending ? null : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <MonitorSmartphone
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {s.device}{" "}
                    {s.current && (
                      <Badge tone="success">{t("sessions.thisDevice")}</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("sessions.lastUsed", {
                      when: ago(s.last_used_at, i18n.language),
                    })}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(s.id, {
                        onSuccess: () => toast.success(t("sessions.closed")),
                      })
                    }
                  >
                    {t("sessions.signOut")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {others > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() =>
              revokeOthers.mutate(undefined, {
                onSuccess: () => toast.success(t("sessions.closed")),
              })
            }
          >
            {t("sessions.signOutOthers")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
