import { Activity, Trash2, UserCheck, Users, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
} from "recharts";
import { toast } from "sonner";
import { Page, PageHeader, Stat } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import {
  useAdminMetrics,
  useAdminUsers,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from "@/lib/queries";
import type { AdminUser } from "@/lib/types";

export function AdminPage() {
  const { t, i18n } = useTranslation();
  const { user: me } = useAuth();
  const { data: metrics } = useAdminMetrics();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const { data: users, isPending } = useAdminUsers({ q: debounced, page });
  const update = useUpdateAdminUser();
  const del = useDeleteAdminUser();
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(i18n.language, { dateStyle: "medium" })
      : t("admin.never");
  const run = (p: Promise<unknown>) =>
    p.catch((e) => toast.error(errorMessage(e, t)));
  const pages = users
    ? Math.max(1, Math.ceil(users.total / users.page_size))
    : 1;

  return (
    <Page>
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("admin.totalUsers")}
          value={metrics?.users.total ?? "–"}
          icon={<Users />}
        />
        <Stat
          label={t("admin.activeUsers")}
          value={metrics?.users.active_7d ?? "–"}
          icon={<Activity />}
        />
        <Stat
          label={t("admin.newUsers")}
          value={metrics?.users.new_7d ?? "–"}
          icon={<UserCheck />}
        />
        <Stat
          label={t("admin.verified")}
          value={metrics?.users.verified ?? "–"}
          icon={<UserCheck />}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("admin.signups")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              {metrics ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={metrics.signups}
                    margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                  >
                    <defs>
                      <linearGradient id="signups" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--primary)"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(8)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                    />
                    <ChartTooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#signups)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Skeleton className="h-full" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.content")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {(
                ["notes", "projects", "habits", "moods", "pomodoros"] as const
              ).map((k) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted-foreground">{t(`admin.${k}`)}</dt>
                  <dd className="font-medium tabular-nums">
                    {metrics?.content[k] ?? "–"}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>{t("admin.users")}</CardTitle>
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.search")}
            aria-label={t("admin.search")}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isPending ? (
            <Skeleton className="h-48" />
          ) : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("auth.name")}</th>
                  <th className="pb-2 font-medium">{t("admin.role")}</th>
                  <th className="pb-2 font-medium">{t("admin.status")}</th>
                  <th className="pb-2 font-medium">{t("admin.lastLogin")}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {users?.items.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2.5">
                        <p className="font-medium">
                          {u.name}{" "}
                          {isMe && (
                            <Badge className="ml-1">{t("admin.you")}</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {u.email}
                        </p>
                      </td>
                      <td>
                        <Badge
                          tone={u.role === "admin" ? "primary" : "neutral"}
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={u.is_active ? "success" : "danger"}>
                          {u.is_active
                            ? t("admin.active")
                            : t("admin.inactive")}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground">
                        {fmt(u.last_login_at)}
                      </td>
                      <td>
                        {!isMe && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                run(
                                  update.mutateAsync({
                                    id: u.id,
                                    role: u.role === "admin" ? "user" : "admin",
                                  }),
                                )
                              }
                            >
                              {u.role === "admin"
                                ? t("admin.makeUser")
                                : t("admin.makeAdmin")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                run(
                                  update.mutateAsync({
                                    id: u.id,
                                    is_active: !u.is_active,
                                  }),
                                )
                              }
                            >
                              {u.is_active ? <UserX /> : <UserCheck />}
                              <span className="sr-only sm:not-sr-only">
                                {u.is_active
                                  ? t("admin.deactivate")
                                  : t("admin.activate")}
                              </span>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setToDelete(u)}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {users && users.total > users.page_size && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {page} / {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("admin.prev")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("admin.next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("admin.deleteTitle")}
        description={t("admin.deleteDesc")}
        confirmLabel={t("common.delete")}
        pending={del.isPending}
        onConfirm={() =>
          toDelete &&
          run(del.mutateAsync(toDelete.id).then(() => setToDelete(null)))
        }
      />
    </Page>
  );
}
