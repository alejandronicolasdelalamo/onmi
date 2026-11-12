import { CheckCircle2, FileText, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { parseUtc } from "@/lib/format";
import { useProjectActivity } from "@/lib/queries";

const ICONS = {
  goal_created: Target,
  goal_done: CheckCircle2,
  note: FileText,
} as const;

/** Lo último que ha pasado en un proyecto: metas creadas o cumplidas y notas vinculadas. */
export function ProjectActivity({ id }: { id: number }) {
  const { t, i18n } = useTranslation();
  const { data } = useProjectActivity(id);
  if (!data || data.length === 0) return null;
  return (
    <section
      aria-label={t("projects.activity")}
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <h3 className="text-sm font-medium">{t("projects.activity")}</h3>
      <ul className="space-y-1.5">
        {data.map((a) => {
          const Icon = ICONS[a.kind];
          return (
            <li
              key={`${a.kind}-${a.id}-${a.at}`}
              className="flex items-center gap-2 text-sm"
            >
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">
                  {t(`projects.activityKinds.${a.kind}`)}{" "}
                </span>
                {a.title}
              </span>
              <time
                dateTime={a.at}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {new Date(parseUtc(a.at)).toLocaleDateString(i18n.language, {
                  day: "numeric",
                  month: "short",
                })}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
