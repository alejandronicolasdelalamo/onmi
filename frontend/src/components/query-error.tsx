import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

/** Estado de error de una consulta: dice qué pasó y ofrece reintentar. */
export function QueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
    >
      <AlertTriangle className="size-6 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{t("common.somethingWrong")}</p>
        <p className="text-sm text-muted-foreground">
          {errorMessage(error, t)}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

function Fallback({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[50dvh] place-items-center p-6">
      <div role="alert" className="max-w-sm space-y-4 text-center">
        <AlertTriangle
          className="mx-auto size-8 text-destructive"
          aria-hidden
        />
        <h1 className="text-xl font-semibold">{t("common.somethingWrong")}</h1>
        <p className="text-sm text-muted-foreground">{t("errors.generic")}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={onReset}>{t("common.retry")}</Button>
          <Button variant="outline" onClick={() => window.location.assign("/")}>
            {t("notFound.home")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Último recurso: un fallo de renderizado no deja la pantalla en blanco. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <Fallback onReset={() => this.setState({ failed: false })} />
    ) : (
      this.props.children
    );
  }
}
