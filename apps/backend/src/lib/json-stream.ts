export const extractJsonFromText = (text: string): string => {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
};

export const sanitizeJsonLikeText = (text: string) => {
  let inString = false;
  let escaped = false;
  let sanitized = '';

  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        sanitized += character;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        sanitized += character;
        continue;
      }
      if (character === '"') {
        inString = false;
        sanitized += character;
        continue;
      }
      if (character === '\n') {
        sanitized += '\\n';
        continue;
      }
      if (character === '\r') {
        continue;
      }
      sanitized += character;
      continue;
    }

    if (character === '"') {
      inString = true;
    }
    sanitized += character;
  }

  return sanitized.replace(/,\s*(}|])/g, '$1');
};

export const parseJsonResponse = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonText = extractJsonFromText(trimmed);
    try {
      return JSON.parse(jsonText);
    } catch {
      return JSON.parse(sanitizeJsonLikeText(jsonText));
    }
  }
};

export const extractJsonStringValue = (text: string, property: string): string | null => {
  const propertyIndex = text.indexOf(`"${property}"`);
  if (propertyIndex === -1) return null;

  const colonIndex = text.indexOf(':', propertyIndex);
  if (colonIndex === -1) return null;

  const openingQuoteIndex = text.indexOf('"', colonIndex + 1);
  if (openingQuoteIndex === -1) return null;

  let escaped = false;
  let value = '';
  for (let index = openingQuoteIndex + 1; index < text.length; index++) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      value += character === 'n' ? '\n' : character;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      return value;
    }
    value += character;
  }

  return null;
};

export const extractJsonNumberValue = (text: string, property: string): number | null => {
  const propertyIndex = text.indexOf(`"${property}"`);
  if (propertyIndex === -1) return null;

  const colonIndex = text.indexOf(':', propertyIndex);
  if (colonIndex === -1) return null;

  const match = text.slice(colonIndex + 1).match(/^\s*(-?\d+(?:\.\d+)?)\s*(?=[,}\]\n])/);
  return match ? Number(match[1]) : null;
};

export const extractCompleteObjectsFromJsonArray = (text: string, property: string): string[] => {
  const propertyIndex = text.indexOf(`"${property}"`);
  if (propertyIndex === -1) return [];

  const arrayStart = text.indexOf('[', propertyIndex);
  if (arrayStart === -1) return [];

  const objects: string[] = [];
  let objectStart = -1;
  let objectDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < text.length; index++) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      if (objectDepth === 0) objectStart = index;
      objectDepth++;
      continue;
    }

    if (character === '}') {
      objectDepth--;
      if (objectDepth === 0 && objectStart !== -1) {
        objects.push(text.slice(objectStart, index + 1));
        objectStart = -1;
      }
      continue;
    }

    if (character === ']' && objectDepth === 0) break;
  }

  return objects;
};
