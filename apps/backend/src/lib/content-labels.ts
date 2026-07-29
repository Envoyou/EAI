const operationalTitlePatterns = [
  /^(?:tolong\s+)?buat(?:kan)?(?:\s+saya)?\s+(?:sebuah\s+)?(?:artikel|draf|draft|blueprint)\b/iu,
  /^(?:please\s+)?(?:write|create|generate)(?:\s+me)?\s+(?:an?\s+)?(?:article|draft|blueprint)\b/iu,
  /^(?:the\s+)?final draft (?:has|was|is)\b/iu,
  /^draft final (?:sudah|telah|masih|memiliki)\b/iu,
  /^draf final (?:sudah|telah|masih|memiliki)\b/iu,
  /\bautomatic quality gate\b/iu,
  /\bmanual editorial review\b/iu,
  /\bquality gate (?:did not|has not|belum|tidak)\b/iu,
  /\b(?:review|verifikasi) (?:editor|editorial|sumber).*(?:export|ekspor)\b/iu,
];

export const isOperationalContentLabel = (
  value: string | null | undefined
): boolean => {
  const candidate = value?.trim();
  return Boolean(
    candidate &&
      operationalTitlePatterns.some((pattern) => pattern.test(candidate))
  );
};

export const cleanContentLabel = (
  value: string | null | undefined,
  maxLength = 500
): string | null => {
  const candidate = value?.replace(/\s+/g, ' ').trim();
  return candidate && !isOperationalContentLabel(candidate)
    ? candidate.slice(0, maxLength)
    : null;
};

export const extractArticleTitle = (
  content: string | null | undefined
): string | null => {
  const lines = (content ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const markdownH1 = lines
    .map((line) => line.match(/^#\s+(.+)$/u)?.[1])
    .find((value): value is string => Boolean(value));
  if (markdownH1) return cleanContentLabel(markdownH1, 500);

  const firstLine = lines[0]?.replace(/^#{1,6}\s+/u, '').trim();
  if (
    firstLine &&
    firstLine.length <= 220 &&
    !/[.!?]\s*$/u.test(firstLine)
  ) {
    return cleanContentLabel(firstLine, 500);
  }
  return null;
};
