import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { parseUtc } from "@/lib/format";
import { passkeysSupported } from "@/lib/passkeys";

interface PasskeyInfo {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

/** Passkeys: entrar con Face ID, Touch ID o una llave de seguridad, sin contraseña. */
export function PasskeysCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const supported = passkeysSupported();
  const list = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () =>
      (await api.get<{ items: PasskeyInfo[] }>("/api/auth/passkeys")).items,
    enabled: supported,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["passkeys"] });

  const add = useMutation({
    mutationFn: async () => {
      const { options, challenge_token } = await api.post<{
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
        challenge_token: string;
      }>("/api/auth/passkeys/register/options");
      const credential = await startRegistration({ optionsJSON: options });
      return api.post("/api/auth/passkeys/register/verify", {
        credential,
        challenge_token,
        name: deviceName(),
      });
    },
    onSuccess: () => {
      toast.success(t("passkeys.added"));
      refresh();
    },
    onError: (e) => {
      // Cancelar el cuadro de Face ID no es un error que enseñar.
      if (e instanceof Error && e.name === "NotAllowedError") return;
      toast.error(
        e instanceof Error && e.name === "InvalidStateError"
          ? t("passkeys.alreadyHere")
          : errorMessage(e, t),
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/auth/passkeys/${id}`),
    onSuccess: () => {
      toast.success(t("passkeys.removed"));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("passkeys.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("passkeys.desc")}
        </p>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            {t("passkeys.unsupported")}
          </p>
        ) : (
          <>
            {(list.data ?? []).length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {list.data!.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <Fingerprint
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("passkeys.created", {
                          date: new Date(
                            parseUtc(p.created_at),
                          ).toLocaleDateString(i18n.language),
                        })}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={`${t("common.delete")}: ${p.name}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(p.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              onClick={() => add.mutate()}
              disabled={add.isPending}
            >
              <Fingerprint /> {t("passkeys.add")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Nombre corto del dispositivo para reconocer la passkey en la lista. */
export function deviceName(ua = navigator.userAgent): string {
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Dispositivo";
  return system;
}
