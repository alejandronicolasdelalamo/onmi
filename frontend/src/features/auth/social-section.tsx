import { Fingerprint, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth, usePublicConfig } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { passkeysSupported } from "@/lib/passkeys";
import { GoogleButton } from "./google-button";

/** Login con Google y botón "Try demo". Cada uno se oculta si el servidor no lo ofrece. */
export function SocialSection({
  withPasskey = false,
}: {
  withPasskey?: boolean;
}) {
  const { t } = useTranslation();
  const { google, demo, passkey } = useAuth();
  const { data: cfg } = usePublicConfig();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const onGoogle = useCallback(
    (credential: string) => {
      setBusy(true);
      google(credential)
        .then(() => navigate("/", { replace: true }))
        .catch((e) => toast.error(errorMessage(e, t)))
        .finally(() => setBusy(false));
    },
    [google, navigate, t],
  );

  const onDemo = () => {
    setBusy(true);
    demo()
      .then(() => navigate("/", { replace: true }))
      .catch((e) => toast.error(errorMessage(e, t)))
      .finally(() => setBusy(false));
  };

  const onPasskey = () => {
    setBusy(true);
    passkey()
      .then(() => navigate("/", { replace: true }))
      .catch((e) => {
        // Cancelar el cuadro de Face ID no es un error que enseñar.
        if (e instanceof Error && e.name === "NotAllowedError") return;
        toast.error(errorMessage(e, t));
      })
      .finally(() => setBusy(false));
  };

  const showPasskey = withPasskey && passkeysSupported();
  if (!cfg || (!cfg.google_client_id && !cfg.demo_enabled && !showPasskey))
    return null;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("auth.orContinue")}
        <span className="h-px flex-1 bg-border" />
      </div>
      {showPasskey && (
        <Button
          variant="outline"
          className="w-full"
          onClick={onPasskey}
          disabled={busy}
        >
          <Fingerprint /> {t("auth.passkey")}
        </Button>
      )}
      {cfg.google_client_id && (
        <GoogleButton clientId={cfg.google_client_id} onCredential={onGoogle} />
      )}
      {cfg.demo_enabled && (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            className="w-full"
            onClick={onDemo}
            disabled={busy}
          >
            <Sparkles /> {t("auth.demo")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t("auth.demoHint")}
          </p>
        </div>
      )}
    </div>
  );
}
