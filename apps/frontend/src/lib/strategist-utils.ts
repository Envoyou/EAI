export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function extractDynamicSuggestions(content: string): { displayContent: string; suggestions?: string[] } {
  const match = content.match(/\[SUGGESTIONS:\s*([\s\S]*?)\](?![^\]]*\])/);
  if (match) {
    const suggestions = match[1].split('|').map(s => s.trim());
    const displayContent = content.replace(match[0], '').trim();
    return { displayContent, suggestions };
  }
  const displayContent = content.replace(/\[SUGGESTIONS:[\s\S]*/, '').trim();
  return { displayContent, suggestions: undefined };
}