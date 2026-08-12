export interface EditorFocusRange {
  from: number;
  to: number;
}

export const normalizeEditorFocusText = (value: string): string => value
  .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
  .replace(/[*_~`]+/gu, '')
  .replace(/\\([\\`*_[\]{}()#+\-.!])/gu, '$1')
  .replace(/\s+/gu, ' ')
  .trim();

export const findEditorFocusRange = (
  textBlock: string,
  requestedText: string
): EditorFocusRange | null => {
  const target = normalizeEditorFocusText(requestedText);
  if (!target) return null;

  let from = textBlock.indexOf(target);
  if (from < 0) {
    from = textBlock.toLocaleLowerCase().indexOf(target.toLocaleLowerCase());
  }
  if (from < 0) return null;

  return { from, to: from + target.length };
};
