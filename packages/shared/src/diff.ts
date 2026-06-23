export interface DiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

const splitIntoParagraphs = (text: string) =>
  text
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);

const buildLcsMatrix = (a: string[], b: string[]) => {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  return matrix;
};

export const buildParagraphDiff = (beforeText: string, afterText: string) => {
  const before = splitIntoParagraphs(beforeText);
  const after = splitIntoParagraphs(afterText);
  const matrix = buildLcsMatrix(before, after);
  const segments: DiffSegment[] = [];

  let i = before.length;
  let j = after.length;

  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      segments.unshift({ type: 'unchanged', text: before[i - 1] });
      i -= 1;
      j -= 1;
      continue;
    }

    if (matrix[i - 1][j] >= matrix[i][j - 1]) {
      segments.unshift({ type: 'removed', text: before[i - 1] });
      i -= 1;
      continue;
    }

    segments.unshift({ type: 'added', text: after[j - 1] });
    j -= 1;
  }

  while (i > 0) {
    segments.unshift({ type: 'removed', text: before[i - 1] });
    i -= 1;
  }

  while (j > 0) {
    segments.unshift({ type: 'added', text: after[j - 1] });
    j -= 1;
  }

  const summary = segments.reduce(
    (acc, segment) => {
      if (segment.type === 'added') acc.added += 1;
      if (segment.type === 'removed') acc.removed += 1;
      if (segment.type === 'unchanged') acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );

  return {
    segments,
    summary,
  };
};
