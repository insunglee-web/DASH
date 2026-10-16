import { describe, expect, it } from "vitest";
import { maskSecrets } from "../security/mask";
import { NotionError, normalizeId, pageTitle, type NotionBlock, type NotionConfig } from "./client";
import { convertBlock, fetchPageContent, plainText, safeHref, toSegments } from "./render";
import { collectChildPages } from "./tree";

// 가짜 Notion API: blockId → 자식 블록 목록 (페이지네이션 2개로 나눠서 돌려준다)
function fakeNotion(tree: Record<string, NotionBlock[]>, calls: string[] = []): NotionConfig {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") !== "Bearer test-token") return Response.json({ code: "unauthorized" }, { status: 401 });
    const match = /\/v1\/blocks\/([^/]+)\/children/.exec(url.pathname);
    if (!match) return Response.json({ code: "object_not_found", message: "없음" }, { status: 404 });
    const all = tree[decodeURIComponent(match[1])];
    if (!all) return Response.json({ code: "object_not_found", message: "없음" }, { status: 404 });
    const start = Number(url.searchParams.get("start_cursor") ?? "0");
    const pageSize = 2;
    const results = all.slice(start, start + pageSize);
    const next = start + pageSize < all.length ? String(start + pageSize) : null;
    return Response.json({ results, has_more: next !== null, next_cursor: next });
  }) as typeof fetch;
  return { token: "test-token", version: "2026-03-11", fetchImpl };
}

const block = (id: string, type: string, data: object = {}, hasChildren = false): NotionBlock => ({
  object: "block",
  id,
  type,
  has_children: hasChildren,
  last_edited_time: "2026-10-16T00:00:00.000Z",
  [type]: data,
});

const rt = (text: string, extra: object = {}) => ({ plain_text: text, ...extra });

describe("collectChildPages", () => {
  it("하위 페이지를 깊이 제한까지 찾고 휴지통 페이지는 뺀다", async () => {
    const config = fakeNotion({
      root: [
        block("p1", "child_page", { title: "20260709 목" }),
        block("intro", "paragraph", { rich_text: [rt("안내")] }),
        block("y2026", "child_page", { title: "2026년" }, true),
        { ...block("old", "child_page", { title: "20250101 수" }), in_trash: true },
      ],
      y2026: [block("p2", "child_page", { title: "20260906 사업계획" }, true)],
      p2: [block("deep", "child_page", { title: "너무 깊음" })],
    });
    const pages = await collectChildPages(config, "root", 2);
    expect(pages.map((p) => [p.id, p.title, p.depth])).toEqual([
      ["p1", "20260709 목", 1],
      ["y2026", "2026년", 1],
      ["p2", "20260906 사업계획", 2],
    ]);
  });

  it("권한이 없으면 NotionError(404)", async () => {
    await expect(collectChildPages(fakeNotion({}), "root", 2)).rejects.toBeInstanceOf(NotionError);
  });
});

describe("fetchPageContent", () => {
  it("블록을 재귀로 읽어 정규화하고 하위 페이지 본문은 읽지 않는다", async () => {
    const calls: string[] = [];
    const config = fakeNotion(
      {
        page: [
          block("h", "heading_2", { rich_text: [rt("안건")] }),
          block("b1", "bulleted_list_item", { rich_text: [rt("예산 ", {}), rt("확정", { annotations: { bold: true } })] }, true),
          block("t", "to_do", { rich_text: [rt("자료 공유")], checked: true }),
          block("tbl", "table", {}, true),
          block("sub", "child_page", { title: "첨부 회의" }, true),
          block("img", "image", {}),
          block("u", "unsupported", { block_type: "form" }),
        ],
        b1: [block("b1c", "paragraph", { rich_text: [rt("세부")] })],
        tbl: [
          block("r1", "table_row", { cells: [[rt("항목")], [rt("금액")]] }),
          block("r2", "table_row", { cells: [[rt("광고")], [rt("100")]] }),
        ],
      },
      calls,
    );
    const { blocks, truncated } = await fetchPageContent(config, "page");
    expect(truncated).toBe(false);
    expect(blocks[0]).toEqual({ kind: "heading", level: 2, text: [{ text: "안건" }] });
    expect(blocks[1]).toEqual({
      kind: "bulleted",
      text: [{ text: "예산 " }, { text: "확정", bold: true }],
      children: [{ kind: "paragraph", text: [{ text: "세부" }] }],
    });
    expect(blocks[2]).toMatchObject({ kind: "todo", checked: true });
    expect(blocks[3]).toEqual({
      kind: "table",
      rows: [
        [[{ text: "항목" }], [{ text: "금액" }]],
        [[{ text: "광고" }], [{ text: "100" }]],
      ],
    });
    expect(blocks[4]).toEqual({ kind: "childPage", title: "첨부 회의", pageId: "sub" });
    expect(blocks[5]).toEqual({ kind: "unsupported", type: "image" });
    expect(blocks[6]).toEqual({ kind: "unsupported", type: "form" });
    expect(calls.some((c) => c.includes("/blocks/sub/"))).toBe(false);
    expect(plainText(blocks)).toContain("예산 확정");
  });
});

describe("helpers", () => {
  it("javascript: 링크는 버린다", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(toSegments([rt("x", { href: "javascript:alert(1)" })])).toEqual([{ text: "x" }]);
    expect(convertBlock(block("bm", "bookmark", { url: "javascript:x" }))).toEqual({ kind: "unsupported", type: "bookmark" });
  });

  it("ID 정규화와 제목", () => {
    expect(normalizeId("39dfa7ab52b680c99e08db79b4afe378")).toBe("39dfa7ab-52b6-80c9-9e08-db79b4afe378");
    expect(
      pageTitle({
        object: "page",
        id: "x",
        created_time: "",
        last_edited_time: "",
        properties: { title: { type: "title", title: [rt("놀발 업무일지 및 미팅록")] } },
      }),
    ).toBe("놀발 업무일지 및 미팅록");
  });

  it("DB 연결 주소의 비밀번호를 가린다", () => {
    expect(maskSecrets("connect postgresql://postgres.abc:p%40ss@aws-0.pooler.supabase.com:6543/postgres")).toBe(
      "connect postgresql://postgres.abc:***@aws-0.pooler.supabase.com:6543/postgres",
    );
  });
});
