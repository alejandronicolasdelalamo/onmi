import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { NoteImage } from "./note-image";

const WIKILINK = /\[\[([^[\]\n]{1,150})\]\]/g;

export interface ResolvedLink {
  title: string;
  id: number | null;
}

/** Convierte [[título]] en un enlace interno si hay una nota con ese título (si no, queda como texto). */
export function resolveWikiLinks(md: string, links: ResolvedLink[] = []) {
  return md.replace(WIKILINK, (_m, raw: string) => {
    const title = raw.trim();
    const hit = links.find(
      (l) => l.title.toLowerCase() === title.toLowerCase(),
    );
    return hit?.id ? `[${title}](#note:${hit.id})` : `\\[\\[${title}\\]\\]`;
  });
}

const transformUrl = (url: string) =>
  url.startsWith("onmi-image:") || url.startsWith("#note:")
    ? url
    : defaultUrlTransform(url);

/**
 * Render de Markdown seguro (react-markdown no inyecta HTML crudo). Se carga bajo demanda.
 * Entiende `![](onmi-image:ID)` (imágenes de la nota) y `[[título]]` (enlaces entre notas).
 */
export default function Markdown({
  children,
  links,
  onOpenNote,
}: {
  children: string;
  links?: ResolvedLink[];
  onOpenNote?: (id: number) => void;
}) {
  const text = useMemo(
    () => resolveWikiLinks(children, links),
    [children, links],
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={transformUrl}
      components={{
        a: ({ node: _node, href, children: kids, ...props }) =>
          href?.startsWith("#note:") ? (
            <button
              type="button"
              className="cursor-pointer font-medium text-primary underline underline-offset-2"
              onClick={() => onOpenNote?.(Number(href.slice(6)))}
            >
              {kids}
            </button>
          ) : (
            <a {...props} href={href} target="_blank" rel="noreferrer noopener">
              {kids}
            </a>
          ),
        img: ({ node: _node, src, alt }) => {
          const m = typeof src === "string" && /^onmi-image:(\d+)$/.exec(src);
          return m ? (
            <NoteImage id={Number(m[1])} alt={alt} />
          ) : (
            <img
              src={src}
              alt={alt ?? ""}
              loading="lazy"
              className="max-w-full rounded-md"
            />
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
