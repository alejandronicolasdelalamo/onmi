import { Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Insights } from "@/lib/types";

export interface ShareLabels {
  title: string;
  date: string;
  habits: string;
  focus: string;
  goals: string;
  mood: string;
  streak: string | null;
}

interface Stat {
  label: string;
  value: string;
}

export function weekStats(
  week: Insights["week"]["current"],
  labels: ShareLabels,
  minutes: (n: number) => string,
): Stat[] {
  return [
    {
      label: labels.habits,
      value:
        week.habit_rate === null
          ? "—"
          : `${Math.round(week.habit_rate * 100)}%`,
    },
    { label: labels.focus, value: minutes(week.focus_minutes) },
    { label: labels.goals, value: String(week.goals_done) },
    {
      label: labels.mood,
      value: week.avg_mood === null ? "—" : `${week.avg_mood.toFixed(1)}/5`,
    },
  ];
}

/** Dibuja la tarjeta (1080×1350, formato vertical para historias y mensajes). */
export function drawWeekCard(
  canvas: HTMLCanvasElement,
  stats: Stat[],
  labels: ShareLabels,
) {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#4f46e5");
  bg.addColorStop(1, "#7c3aed");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Círculos decorativos.
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#fff";
  for (const [x, y, r] of [
    [980, 160, 260],
    [60, 1180, 320],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const font = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 64px ${font}`;
  ctx.fillText("ONMi", 80, 140);
  ctx.font = `600 78px ${font}`;
  ctx.fillText(labels.title, 80, 300);
  ctx.globalAlpha = 0.8;
  ctx.font = `400 40px ${font}`;
  ctx.fillText(labels.date, 80, 365);
  ctx.globalAlpha = 1;

  const cardW = 440;
  const cardH = 330;
  stats.slice(0, 4).forEach((s, i) => {
    const x = 80 + (i % 2) * (cardW + 40);
    const y = 450 + Math.floor(i / 2) * (cardH + 40);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 36);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `700 120px ${font}`;
    ctx.fillText(s.value, x + 40, y + 180);
    ctx.globalAlpha = 0.85;
    ctx.font = `500 40px ${font}`;
    ctx.fillText(s.label, x + 40, y + 260);
    ctx.globalAlpha = 1;
  });

  if (labels.streak) {
    ctx.font = `600 46px ${font}`;
    ctx.fillText(labels.streak, 80, 1260);
  }
}

export function ShareWeekButton({ data }: { data: Insights }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const top = data.top_streak;
      const labels: ShareLabels = {
        title: t("share.title"),
        date: new Date().toLocaleDateString(i18n.language, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        habits: t("share.habits"),
        focus: t("share.focus"),
        goals: t("share.goals"),
        mood: t("share.mood"),
        streak: top
          ? t("share.streak", {
              name: top.name,
              count: top.count,
              unit: top.unit === "week" ? t("share.weeks") : t("share.days"),
            })
          : null,
      };
      const canvas = document.createElement("canvas");
      drawWeekCard(
        canvas,
        weekStats(data.week.current, labels, (n) =>
          t("dashboard.minutes", { count: n }),
        ),
        labels,
      );
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png"),
      );
      if (!blob) throw new Error("no image");
      const file = new File([blob], "onmi-week.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: labels.title });
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), {
          href: url,
          download: "onmi-week.png",
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(t("share.downloaded"));
      }
    } catch (e) {
      // Cancelar la hoja de compartir no es un error.
      if (!(e instanceof DOMException && e.name === "AbortError"))
        toast.error(t("share.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" onClick={() => void share()} disabled={busy}>
      <Share2 /> {t("share.button")}
    </Button>
  );
}
