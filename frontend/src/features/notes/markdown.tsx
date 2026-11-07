import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render de Markdown seguro (react-markdown no inyecta HTML crudo). Se carga bajo demanda. */
export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer noopener" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
