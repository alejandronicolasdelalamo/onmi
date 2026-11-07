import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import type { CoachReview, CoachStatus } from "@/lib/types";

const Markdown = lazy(() => import("@/features/notes/markdown"));
const STATUS_KEY = ["coach", "status"] as const;

/** Revisión semanal escrita por el coach (con Claude si el usuario lo activó, o con el redactor local). */
export function CoachCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [aiError, setAiError] = useState(false);
  const [cooldown, setCooldown] = useState<number | null>(null);

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api.get<CoachStatus>("/api/coach/status"),
  });

  const generate = useMutation({
    mutationFn: (refresh: boolean) =>
      api.post<CoachReview & { ai_error?: boolean }>("/api/coach/review", {
        refresh,
      }),
    onSuccess: ({ ai_error, ...review }) => {
      setCooldown(null);
      setAiError(!!ai_error);
      qc.setQueryData<CoachStatus>(STATUS_KEY, (old) =>
        old ? { ...old, review } : old,
      );
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "coach_cooldown") {
        const seconds = Number(e.details?.[0]?.message ?? 3600);
        setCooldown(Math.max(1, Math.ceil(seconds / 60)));
      }
    },
  });

  const data = status.data;
  const review = data?.review ?? null;

  return (
    <Card aria-labelledby="coach-title">
      <CardHeader>
        <CardTitle id="coach-title" className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {t("coach.title")}
        </CardTitle>
        {review && (
          <Badge tone={review.source === "claude" ? "primary" : "neutral"}>
            {review.source === "claude"
              ? t("coach.sourceClaude")
              : t("coach.sourceLocal")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <div aria-live="polite" aria-busy={generate.isPending}>
              {review ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("coach.forWeek", {
                      date: formatDate(review.week_start, {
                        day: "numeric",
                        month: "long",
                      }),
                    })}
                  </p>
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mb-1 prose-headings:mt-4 prose-headings:text-sm prose-headings:font-semibold prose-p:my-1">
                    <Suspense fallback={<Skeleton className="h-20" />}>
                      <Markdown>{review.text}</Markdown>
                    </Suspense>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("coach.empty")}
                </p>
              )}
            </div>

            {aiError && (
              <p className="text-xs text-muted-foreground">
                {t("coach.aiError")}
              </p>
            )}
            {generate.isError && cooldown === null && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(generate.error, t)}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={review ? "outline" : "default"}
                size="sm"
                onClick={() => generate.mutate(!!review)}
                disabled={generate.isPending}
              >
                {generate.isPending
                  ? t("coach.generating")
                  : review
                    ? t("coach.refresh")
                    : t("coach.generate")}
              </Button>
              {cooldown !== null && (
                <p role="status" className="text-xs text-muted-foreground">
                  {t("coach.cooldown", { minutes: cooldown })}
                </p>
              )}
              {data && data.can_enable && !data.ai_enabled && (
                <p className="text-xs text-muted-foreground">
                  {t("coach.enableHint")}{" "}
                  <Link
                    to="/settings#ai-coach"
                    className="font-medium text-primary hover:underline"
                  >
                    {t("nav.profile")}
                  </Link>
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
