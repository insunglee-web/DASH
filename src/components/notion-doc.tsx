import Link from "next/link";
import type { ReactNode } from "react";
import type { DocBlock, Segment } from "@/lib/notion/render";

// 저장된 DocBlock을 React 요소로 그린다. HTML 문자열을 삽입하지 않는다.

function Text({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) => {
        let node: ReactNode = s.text;
        if (s.code) node = <code className="rounded bg-surface-muted px-1 py-0.5 text-[0.9em]">{node}</code>;
        if (s.bold) node = <strong>{node}</strong>;
        if (s.italic) node = <em>{node}</em>;
        if (s.strike) node = <s>{node}</s>;
        if (s.href) {
          node = (
            <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function Children({ blocks }: { blocks?: DocBlock[] }) {
  return blocks && blocks.length > 0 ? (
    <div className="mt-1 border-l border-border pl-4">
      <NotionDoc blocks={blocks} />
    </div>
  ) : null;
}

/** 연속된 목록 항목을 하나의 ul/ol로 묶는다 */
function group(blocks: DocBlock[]): (DocBlock | { kind: "list"; ordered: boolean; items: DocBlock[] })[] {
  const out: (DocBlock | { kind: "list"; ordered: boolean; items: DocBlock[] })[] = [];
  for (const b of blocks) {
    const ordered = b.kind === "numbered";
    if (b.kind === "bulleted" || b.kind === "numbered") {
      const last = out[out.length - 1];
      if (last && last.kind === "list" && last.ordered === ordered) last.items.push(b);
      else out.push({ kind: "list", ordered, items: [b] });
    } else {
      out.push(b);
    }
  }
  return out;
}

export function NotionDoc({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="flex flex-col gap-2 leading-7">
      {group(blocks).map((b, i) => {
        switch (b.kind) {
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} pl-6`}>
                {b.items.map((item, j) =>
                  "text" in item && typeof item.text !== "string" ? (
                    <li key={j}>
                      <Text segments={item.text} />
                      <Children blocks={"children" in item ? item.children : undefined} />
                    </li>
                  ) : null,
                )}
              </Tag>
            );
          }
          case "heading": {
            const size = b.level === 1 ? "text-xl" : b.level === 2 ? "text-lg" : "text-base";
            return (
              <div key={i} className={`${size} mt-3 font-bold`}>
                <Text segments={b.text} />
                <Children blocks={b.children} />
              </div>
            );
          }
          case "paragraph":
            return b.text.length === 0 && !b.children ? (
              <div key={i} className="h-2" />
            ) : (
              <div key={i}>
                <p>
                  <Text segments={b.text} />
                </p>
                <Children blocks={b.children} />
              </div>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-border pl-3 text-muted">
                <Text segments={b.text} />
                <Children blocks={b.children} />
              </blockquote>
            );
          case "callout":
            return (
              <div key={i} className="rounded-lg bg-surface-muted px-3 py-2">
                <Text segments={b.text} />
                <Children blocks={b.children} />
              </div>
            );
          case "todo":
            return (
              <div key={i}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={b.checked} readOnly disabled className="mt-1.5" />
                  <span className={b.checked ? "text-muted line-through" : undefined}>
                    <Text segments={b.text} />
                  </span>
                </label>
                <Children blocks={b.children} />
              </div>
            );
          case "toggle":
            return (
              <details key={i}>
                <summary className="cursor-pointer">
                  <Text segments={b.text} />
                </summary>
                <Children blocks={b.children} />
              </details>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-sm">
                <code>{b.text}</code>
              </pre>
            );
          case "divider":
            return <hr key={i} className="my-2 border-border" />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} className="border border-border px-2 py-1 align-top">
                            <Text segments={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "link":
            return (
              <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
                {b.label}
              </a>
            );
          case "childPage":
            return (
              <p key={i} className="text-muted">
                📄 하위 페이지: {b.title || "(제목 없음)"}
              </p>
            );
          case "unsupported":
            return (
              <p key={i} className="text-sm text-muted">
                [{b.type}] 이 블록은 Notion에서 확인해 주세요.
              </p>
            );
        }
      })}
    </div>
  );
}

export function NoteLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`/notes/${id}`} className="block rounded-lg px-3 py-2.5 hover:bg-surface-muted">
      {children}
    </Link>
  );
}
