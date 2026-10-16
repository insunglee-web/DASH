import { isTrashed, listBlockChildren, type NotionBlock, type NotionConfig } from "./client";

// 회의록 상위 페이지 아래의 하위 페이지(child_page)를 깊이 제한까지 찾는다 (architecture.md 3장)
// 날짜 페이지가 바로 아래에 있든 연/월 페이지를 거치든 같은 방식으로 찾는다.

export type FoundPage = {
  id: string;
  title: string;
  parentId: string;
  depth: number;
  createdTime: string | null;
  lastEditedTime: string | null;
};

export async function collectChildPages(
  config: NotionConfig,
  rootId: string,
  maxDepth: number,
): Promise<FoundPage[]> {
  const found: FoundPage[] = [];
  const walk = async (parentId: string, depth: number) => {
    const children = await listBlockChildren(config, parentId);
    for (const block of children) {
      if (block.type !== "child_page" || isTrashed(block)) continue;
      const page: FoundPage = {
        id: block.id,
        title: childPageTitle(block),
        parentId,
        depth,
        createdTime: block.created_time ?? null,
        lastEditedTime: block.last_edited_time ?? null,
      };
      found.push(page);
      if (depth < maxDepth && block.has_children) await walk(block.id, depth + 1);
    }
  };
  await walk(rootId, 1);
  return found;
}

function childPageTitle(block: NotionBlock): string {
  const data = block.child_page as { title?: unknown } | undefined;
  return typeof data?.title === "string" ? data.title : "";
}
