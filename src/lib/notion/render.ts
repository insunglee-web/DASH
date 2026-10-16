import { isTrashed, listBlockChildren, type NotionBlock, type NotionConfig, type RichText } from "./client";

// Notion 블록을 화면에 그리기 위한 단순한 구조로 바꾼다.
// HTML 문자열을 만들지 않는다(XSS 방지). 화면은 이 구조를 React 요소로 그린다.

export type Segment = { text: string; bold?: true; italic?: true; strike?: true; code?: true; href?: string };

export type DocBlock =
  | { kind: "paragraph" | "quote" | "callout"; text: Segment[]; children?: DocBlock[] }
  | { kind: "heading"; level: 1 | 2 | 3; text: Segment[]; children?: DocBlock[] }
  | { kind: "bulleted" | "numbered"; text: Segment[]; children?: DocBlock[] }
  | { kind: "todo"; text: Segment[]; checked: boolean; children?: DocBlock[] }
  | { kind: "toggle"; text: Segment[]; children?: DocBlock[] }
  | { kind: "code"; text: string; language?: string }
  | { kind: "divider" }
  | { kind: "table"; rows: Segment[][][] }
  | { kind: "link"; label: string; url: string }
  | { kind: "childPage"; title: string; pageId: string }
  | { kind: "unsupported"; type: string };

export const MAX_DEPTH = 5;
export const MAX_BLOCKS = 1500;

export function toSegments(rich: RichText[] | undefined): Segment[] {
  return (rich ?? [])
    .filter((r) => r.plain_text)
    .map((r) => {
      const seg: Segment = { text: r.plain_text };
      const a = r.annotations ?? {};
      if (a.bold) seg.bold = true;
      if (a.italic) seg.italic = true;
      if (a.strikethrough) seg.strike = true;
      if (a.code) seg.code = true;
      const href = safeHref(r.href);
      if (href) seg.href = href;
      return seg;
    });
}

/** http/https 링크만 허용 */
export function safeHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function plainText(blocks: DocBlock[]): string {
  const parts: string[] = [];
  const visit = (list: DocBlock[]) => {
    for (const b of list) {
      if ("text" in b) parts.push(typeof b.text === "string" ? b.text : b.text.map((s) => s.text).join(""));
      if (b.kind === "table") parts.push(b.rows.map((r) => r.map((c) => c.map((s) => s.text).join("")).join(" ")).join("\n"));
      if (b.kind === "link") parts.push(b.label);
      if ("children" in b && b.children) visit(b.children);
    }
  };
  visit(blocks);
  return parts.join("\n");
}

type Data = { rich_text?: RichText[]; checked?: boolean; language?: string; url?: string; caption?: RichText[]; title?: string };

/** 블록 하나를 DocBlock으로. 자식은 따로 붙인다. */
export function convertBlock(block: NotionBlock): DocBlock {
  const data = (block[block.type] ?? {}) as Data;
  const text = toSegments(data.rich_text);
  switch (block.type) {
    case "paragraph":
      return { kind: "paragraph", text };
    case "quote":
      return { kind: "quote", text };
    case "callout":
      return { kind: "callout", text };
    case "heading_1":
      return { kind: "heading", level: 1, text };
    case "heading_2":
      return { kind: "heading", level: 2, text };
    case "heading_3":
      return { kind: "heading", level: 3, text };
    case "bulleted_list_item":
      return { kind: "bulleted", text };
    case "numbered_list_item":
      return { kind: "numbered", text };
    case "to_do":
      return { kind: "todo", text, checked: data.checked === true };
    case "toggle":
      return { kind: "toggle", text };
    case "code":
      return { kind: "code", text: text.map((s) => s.text).join(""), language: data.language };
    case "divider":
      return { kind: "divider" };
    case "child_page":
      return { kind: "childPage", title: data.title ?? "", pageId: block.id };
    case "bookmark":
    case "embed":
    case "link_preview": {
      const url = safeHref(data.url);
      if (!url) return { kind: "unsupported", type: block.type };
      const caption = toSegments(data.caption).map((s) => s.text).join("");
      return { kind: "link", label: caption || url, url };
    }
    case "unsupported": {
      const original = (block.unsupported as { block_type?: string } | undefined)?.block_type;
      return { kind: "unsupported", type: original ?? "unsupported" };
    }
    default:
      // 이미지·파일 등은 Notion이 주는 임시 URL이 만료되므로 원문에서 보도록 안내한다
      return { kind: "unsupported", type: block.type };
  }
}

const CONTAINER_KINDS = new Set(["paragraph", "quote", "callout", "heading", "bulleted", "numbered", "todo", "toggle"]);

/** 페이지 본문을 재귀로 읽는다. 하위 페이지 내용은 넣지 않고 링크만 남긴다. */
export async function fetchPageContent(
  config: NotionConfig,
  pageId: string,
): Promise<{ blocks: DocBlock[]; blockCount: number; truncated: boolean }> {
  let count = 0;
  let truncated = false;

  const load = async (parentId: string, depth: number): Promise<DocBlock[]> => {
    const raw = await listBlockChildren(config, parentId);
    const result: DocBlock[] = [];
    for (const block of raw) {
      if (isTrashed(block)) continue;
      if (count >= MAX_BLOCKS) {
        truncated = true;
        break;
      }
      count++;
      if (block.type === "table") {
        result.push({ kind: "table", rows: block.has_children ? await loadTableRows(block.id) : [] });
        continue;
      }
      const doc = convertBlock(block);
      if (block.has_children && block.type !== "child_page" && CONTAINER_KINDS.has(doc.kind)) {
        if (depth < MAX_DEPTH) {
          (doc as { children?: DocBlock[] }).children = await load(block.id, depth + 1);
        } else {
          truncated = true;
        }
      }
      result.push(doc);
    }
    return result;
  };

  const loadTableRows = async (tableId: string): Promise<Segment[][][]> => {
    const rows = await listBlockChildren(config, tableId);
    count += rows.length;
    return rows
      .filter((r) => r.type === "table_row")
      .map((r) => ((r.table_row as { cells?: RichText[][] })?.cells ?? []).map((cell) => toSegments(cell)));
  };

  const blocks = await load(pageId, 1);
  return { blocks, blockCount: count, truncated };
}
