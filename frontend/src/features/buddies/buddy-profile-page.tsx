import { Check, ChevronLeft, Lock, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Page } from "@/components/page";
import { QueryError } from "@/components/query-error";
import { Avatar } from "@/components/ui/avatar";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useBuddyProfile } from "@/lib/queries";
import { cn, localISODate } from "@/lib/utils";
import { HabitLine } from "./buddies-page";

/** Mini perfil de un compañero: solo lo que esa persona decidió compartir. */
export function BuddyProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data, isPending, error, refetch } = useBuddyProfile(Number(id));

  const back = (
    <Link
      to="/buddies"
      className="mb-4 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ChevronLeft className="size-4" aria-hidden /> {t("nav.buddies")}
    </Link>
  );

  if (error instanceof ApiError && error.status === 404)
    return (
      <Page>
        {back}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("buddies.profileNotFound")}
          </CardContent>
        </Card>
      </Page>
    );
  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-72" />;

  const { user, goals, habits } = data;
  const today = localISODate();
  const since = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(data.member_since));

  return (
    <Page className="space-y-6">
      <div>
        {back}
        <div className="flex items-center gap-4">
          <Avatar name={user.name} className="size-16 text-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {user.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.bio || t("buddies.noBio")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("buddies.memberSince", { date: since })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("buddies.goalsTitle")}</CardTitle>
            <Badge>{goals.length}</Badge>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="size-4 shrink-0" aria-hidden />
                {t("buddies.noGoals", { name: user.name })}
              </p>
            ) : (
              <ul className="space-y-2">
                {goals.map((g) => {
                  const overdue = !g.done && !!g.due_date && g.due_date < today;
                  return (
                    <li
                      key={g.id}
                      className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                          g.done
                            ? "border-transparent bg-success text-white"
                            : "border-border text-transparent",
                        )}
                        aria-hidden
                      >
                        {g.done ? (
                          <Check className="size-3" />
                        ) : (
                          <Target className="size-3" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            g.done && "text-muted-foreground line-through",
                          )}
                        >
                          {g.title}
                          <span className="sr-only">
                            {" "}
                            {g.done
                              ? t("buddies.goalDone")
                              : t("buddies.goalOpen")}
                          </span>
                        </p>
                        {g.due_date && (
                          <p
                            className={cn(
                              "text-xs",
                              overdue
                                ? "font-medium text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatDate(g.due_date)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("buddies.habitsTitle")}</CardTitle>
            <Badge>{habits.length}</Badge>
          </CardHeader>
          <CardContent>
            {habits.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="size-4 shrink-0" aria-hidden />
                {t("buddies.noShared", { name: user.name })}
              </p>
            ) : (
              <ul className="space-y-2">
                {habits.map((h) => (
                  <HabitLine key={h.id} habit={h} friendName={user.name} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {t("buddies.privacyNote", { name: user.name })}
      </p>
    </Page>
  );
}
