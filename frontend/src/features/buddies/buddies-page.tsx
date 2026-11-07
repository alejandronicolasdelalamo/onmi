import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Flame,
  Heart,
  MoreHorizontal,
  RefreshCw,
  UserMinus,
  Users,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/page";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import type {
  BuddiesData,
  BuddyFriend,
  BuddyHabit,
  BuddyRelation,
} from "@/lib/types";
import { cn, initials } from "@/lib/utils";

const KEY = ["buddies"] as const;

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
    >
      {initials(name)}
    </span>
  );
}

function HabitLine({
  habit,
  friendName,
  canCheer,
  onCheer,
}: {
  habit: BuddyHabit;
  friendName: string;
  canCheer: boolean;
  onCheer: () => void;
}) {
  const { t } = useTranslation();
  const weekly = habit.target_per_week < 7;
  return (
    <li className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: habit.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{habit.name}</span>
          {habit.done_today && (
            <Badge tone="success">
              <Check className="size-3" aria-hidden /> {t("buddies.doneToday")}
            </Badge>
          )}
        </p>
        <div
          className="flex items-center gap-1"
          role="img"
          aria-label={t("buddies.last7")}
        >
          {habit.last7.map((on, i) => (
            <span
              key={i}
              className={cn("size-2.5 rounded-[3px]", !on && "bg-muted")}
              style={on ? { background: habit.color } : undefined}
            />
          ))}
          {weekly && (
            <span className="ml-2 text-xs tabular-nums text-muted-foreground">
              {t("habits.weekProgress", {
                done: Math.min(habit.week_count, habit.target_per_week),
                target: habit.target_per_week,
              })}
            </span>
          )}
        </div>
      </div>
      {habit.streak > 0 && (
        <Badge tone="warning">
          <Flame className="size-3" aria-hidden /> {habit.streak}
          {habit.streak_unit === "week" ? t("habits.weekSuffix") : ""}
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={!canCheer}
        onClick={onCheer}
        aria-label={t("buddies.cheerHabit", {
          name: friendName,
          habit: habit.name,
        })}
      >
        <Heart />
      </Button>
    </li>
  );
}

function FriendCard({
  friend,
  onCheer,
  onRemove,
  busy,
}: {
  friend: BuddyFriend;
  onCheer: (habitId?: number) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const name = friend.user.name;
  return (
    <Card>
      <CardHeader className="items-start">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("buddies.sharedCount", { count: friend.habits.length })}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 size-8"
              aria-label={t("buddies.options", { name })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem destructive onSelect={onRemove}>
              <UserMinus /> {t("buddies.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-4">
        {friend.habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("buddies.noShared", { name })}
          </p>
        ) : (
          <ul className="space-y-2">
            {friend.habits.map((h) => (
              <HabitLine
                key={h.id}
                habit={h}
                friendName={name}
                canCheer={!friend.cheered_today && !busy}
                onCheer={() => onCheer(h.id)}
              />
            ))}
          </ul>
        )}
        <Button
          variant={friend.cheered_today ? "secondary" : "default"}
          size="sm"
          onClick={() => onCheer()}
          disabled={friend.cheered_today || busy}
        >
          <Heart />{" "}
          {friend.cheered_today
            ? t("buddies.cheeredToday")
            : t("buddies.cheer", { name })}
        </Button>
      </CardContent>
    </Card>
  );
}

function Requests({
  title,
  items,
  actions,
}: {
  title: string;
  items: BuddyRelation[];
  actions: (r: BuddyRelation) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {items.map((r) => (
          <li
            key={r.friendship_id}
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
          >
            <Avatar name={r.user.name} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {r.user.name}
            </span>
            <div className="flex gap-1">{actions(r)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BuddiesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<BuddiesData>("/api/buddies"),
  });
  const [code, setCode] = useState("");
  const [removing, setRemoving] = useState<BuddyRelation | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const fail = (e: unknown) => toast.error(errorMessage(e, t));

  const request = useMutation({
    mutationFn: (c: string) =>
      api.post<{ status: "pending" | "accepted"; user: { name: string } }>(
        "/api/buddies/request",
        { code: c },
      ),
    onSuccess: (r) => {
      toast.success(
        r.status === "accepted"
          ? t("buddies.connected", { name: r.user.name })
          : t("buddies.requestSent", { name: r.user.name }),
      );
      setCode("");
      refresh();
    },
    onError: fail,
  });
  const accept = useMutation({
    mutationFn: (id: number) => api.post(`/api/buddies/${id}/accept`),
    onSuccess: refresh,
    onError: fail,
  });
  const drop = useMutation({
    mutationFn: (id: number) => api.delete(`/api/buddies/${id}`),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
    onError: fail,
  });
  const cheer = useMutation({
    mutationFn: ({
      friendId,
      habitId,
    }: {
      friendId: number;
      habitId?: number;
    }) =>
      api.post(
        `/api/buddies/${friendId}/cheer`,
        habitId ? { habit_id: habitId } : {},
      ),
    onSuccess: () => {
      toast.success(t("buddies.cheerSent"));
      refresh();
    },
    onError: fail,
  });
  const regenerate = useMutation({
    mutationFn: () =>
      api.post<{ code: string }>("/api/buddies/code/regenerate"),
    onSuccess: () => {
      setRegenerating(false);
      toast.success(t("buddies.codeRegenerated"));
      refresh();
    },
    onError: fail,
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("buddies.copied"));
    } catch {
      toast.error(t("buddies.copyFailed"));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) request.mutate(code);
  };

  if (isError) {
    return (
      <Page>
        <PageHeader
          title={t("buddies.title")}
          subtitle={t("buddies.subtitle")}
        />
        <QueryError error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }

  const demo = data !== undefined && data.code === null;

  return (
    <Page>
      <PageHeader title={t("buddies.title")} subtitle={t("buddies.subtitle")} />
      {isPending || !data ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {data.friends.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Users />}
                  title={t("buddies.empty")}
                  description={t("buddies.emptyDesc")}
                />
              </Card>
            ) : (
              data.friends.map((f) => (
                <FriendCard
                  key={f.friendship_id}
                  friend={f}
                  busy={cheer.isPending}
                  onCheer={(habitId) =>
                    cheer.mutate({ friendId: f.user.id, habitId })
                  }
                  onRemove={() => setRemoving(f)}
                />
              ))
            )}

            {data.cheers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("buddies.cheersTitle")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {data.cheers.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 text-sm"
                      >
                        <Heart
                          className="size-4 shrink-0 text-pink-500"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          {c.habit
                            ? t("buddies.cheerFeedHabit", {
                                name: c.from.name,
                                habit: c.habit,
                              })
                            : t("buddies.cheerFeed", { name: c.from.name })}
                        </span>
                        <time
                          dateTime={c.created_at}
                          className="shrink-0 text-xs text-muted-foreground"
                        >
                          {timeAgo(c.created_at, i18n.language)}
                        </time>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card id="code">
              <CardHeader>
                <CardTitle>{t("buddies.yourCode")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {demo ? (
                  <p className="text-sm text-muted-foreground">
                    {t("buddies.demo")}
                  </p>
                ) : (
                  <>
                    <p
                      className="select-all rounded-md bg-muted px-3 py-3 text-center font-mono text-2xl font-semibold tracking-widest"
                      aria-label={t("buddies.yourCode")}
                    >
                      {data.code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("buddies.codeHint")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void copy(data.code!)}
                      >
                        <Copy /> {t("buddies.copy")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRegenerating(true)}
                      >
                        <RefreshCw /> {t("buddies.regenerate")}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {!demo && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("buddies.addTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <form onSubmit={submit} className="space-y-3" noValidate>
                    <Field
                      label={t("buddies.codeLabel")}
                      hint={t("buddies.codeFieldHint")}
                    >
                      {(p) => (
                        <Input
                          {...p}
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          maxLength={20}
                          className="font-mono uppercase tracking-wider"
                          placeholder="ABCD-EFGH"
                        />
                      )}
                    </Field>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!code.trim() || request.isPending}
                    >
                      {t("buddies.sendRequest")}
                    </Button>
                  </form>
                  <Requests
                    title={t("buddies.incoming")}
                    items={data.incoming}
                    actions={(r) => (
                      <>
                        <Button
                          size="sm"
                          onClick={() => accept.mutate(r.friendship_id)}
                          disabled={accept.isPending}
                        >
                          {t("buddies.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => drop.mutate(r.friendship_id)}
                          disabled={drop.isPending}
                        >
                          {t("buddies.decline")}
                        </Button>
                      </>
                    )}
                  />
                  <Requests
                    title={t("buddies.outgoing")}
                    items={data.outgoing}
                    actions={(r) => (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => drop.mutate(r.friendship_id)}
                        disabled={drop.isPending}
                      >
                        {t("buddies.cancel")}
                      </Button>
                    )}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("buddies.removeTitle", { name: removing?.user.name ?? "" })}
        description={t("buddies.removeDesc")}
        confirmLabel={t("buddies.remove")}
        pending={drop.isPending}
        onConfirm={() => removing && drop.mutate(removing.friendship_id)}
      />
      <ConfirmDialog
        open={regenerating}
        onOpenChange={setRegenerating}
        title={t("buddies.regenerateTitle")}
        description={t("buddies.regenerateDesc")}
        confirmLabel={t("buddies.regenerate")}
        pending={regenerate.isPending}
        onConfirm={() => regenerate.mutate()}
      />
    </Page>
  );
}
