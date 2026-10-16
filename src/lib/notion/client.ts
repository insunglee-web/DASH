import { limiters } from "../http/limiter";
import { fetchWithRetry } from "../http/retry";

// Notion API 읽기 전용 클라이언트 (Internal connection, D-04)
// 호출 한도: 평균 초당 3회 → limiters.notion으로 초당 2회 이하

const API_BASE = "https://api.notion.com/v1";

export class NotionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotionError";
  }
}

export type NotionConfig = {
  token: string;
  version: string;
  fetchImpl?: typeof fetch;
  /** 이 시각(epoch ms)을 넘겨 기다려야 하면 DeferredError */
  deadline?: number;
  /** 호출 수 집계용 */
  onCall?: () => void;
};

export function notionConfigFromEnv(deadline?: number): NotionConfig {
  const token = process.env.NOTION_INTERNAL_TOKEN;
  if (!token) throw new NotionError(0, "not_configured", "NOTION_INTERNAL_TOKEN이 설정되지 않았습니다.");
  return { token, version: process.env.NOTION_API_VERSION || "2026-03-11", deadline };
}

export async function notionGet<T>(config: NotionConfig, path: string): Promise<T> {
  config.onCall?.();
  const run = () =>
    fetchWithRetry(
      `${API_BASE}${path}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Notion-Version": config.version,
          Accept: "application/json",
        },
      },
      { fetchImpl: config.fetchImpl, deadline: config.deadline },
    );
  const response = config.fetchImpl ? await run() : await limiters.notion.run(run);
  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!response.ok) {
    throw new NotionError(response.status, body.code ?? "http_error", body.message ?? `Notion HTTP ${response.status}`);
  }
  return body as T;
}

// ── 응답 타입(이 앱에서 쓰는 필드만) ─────────────────────

export type RichText = {
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean };
};

export type NotionBlock = {
  object: "block";
  id: string;
  type: string;
  has_children: boolean;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  [key: string]: unknown;
};

type ListResponse<T> = { results: T[]; has_more: boolean; next_cursor: string | null };

/** 블록의 첫 단계 자식을 페이지네이션을 따라 모두 가져온다 */
export async function listBlockChildren(config: NotionConfig, blockId: string): Promise<NotionBlock[]> {
  const all: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page: ListResponse<NotionBlock> = await notionGet(
      config,
      `/blocks/${encodeURIComponent(blockId)}/children?${query}`,
    );
    all.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}

export type NotionPage = {
  object: "page";
  id: string;
  url?: string;
  created_time: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, { type: string; title?: RichText[] }>;
};

export async function retrievePage(config: NotionConfig, pageId: string): Promise<NotionPage> {
  return notionGet(config, `/pages/${encodeURIComponent(pageId)}`);
}

export function pageTitle(page: NotionPage): string {
  const titleProp = Object.values(page.properties ?? {}).find((p) => p.type === "title");
  return (titleProp?.title ?? []).map((t) => t.plain_text).join("");
}

export function isTrashed(item: { archived?: boolean; in_trash?: boolean }): boolean {
  return item.archived === true || item.in_trash === true;
}

/** Notion 페이지 ID(하이픈 없음/있음)를 하이픈 형식으로 */
export function normalizeId(id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return id;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}
