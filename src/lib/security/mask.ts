// 로그에 토큰, 비밀값이 남지 않도록 가린다 (docs/security.md 4장)

const PATTERNS: [RegExp, string][] = [
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***"],
  [/((?:access|refresh|id)_token["'=:\s]+["']?)[^"'&\s,}]+/gi, "$1***"],
  [/((?:client_secret|secret|password|code|sig)["'=:\s]+["']?)[^"'&\s,}]+/gi, "$1***"],
  [/(secret_|ntn_)[A-Za-z0-9]{10,}/g, "$1***"],
  // postgresql://user:password@host → 비밀번호 가림
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, "$1***@"],
];

export function maskSecrets(text: string): string {
  return PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** 오류를 로그용 한 줄 문자열로. 스택과 본문은 남기지 않는다. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return maskSecrets(message).slice(0, 500);
}
