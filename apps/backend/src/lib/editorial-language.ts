import type { PublicationPackage } from '@eai/shared';

type EditorialLanguage = 'id' | 'en';

const LANGUAGE_MARKERS: Record<EditorialLanguage, ReadonlySet<string>> = {
  id: new Set([
    'adalah', 'akan', 'atau', 'dalam', 'dan', 'dari', 'dengan', 'di', 'ini',
    'juga', 'ke', 'oleh', 'pada', 'sebagai', 'tidak', 'untuk', 'yang',
  ]),
  en: new Set([
    'also', 'and', 'as', 'by', 'for', 'from', 'in', 'is', 'not', 'of', 'or',
    'the', 'this', 'to', 'will', 'with',
  ]),
};

const scoreEditorialLanguage = (text: string) => {
  const tokens = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  return tokens.reduce((score, token) => ({
    id: score.id + (LANGUAGE_MARKERS.id.has(token) ? 1 : 0),
    en: score.en + (LANGUAGE_MARKERS.en.has(token) ? 1 : 0),
  }), { id: 0, en: 0 });
};

export const detectEditorialLanguage = (text: string): EditorialLanguage => {
  const score = scoreEditorialLanguage(text);
  return score.en > score.id ? 'en' : 'id';
};

export const isClearlyDifferentEditorialLanguage = (
  text: string,
  expected: EditorialLanguage
): boolean => {
  const score = scoreEditorialLanguage(text);
  const other = expected === 'en' ? 'id' : 'en';
  return score[other] >= 3 && score[other] > score[expected] * 1.5;
};

export const isPublicationLanguageAligned = (
  publicationPackage: PublicationPackage,
  expected: EditorialLanguage
): boolean => {
  const prose = [
    publicationPackage.title,
    publicationPackage.excerpt,
    publicationPackage.metaTitle,
    publicationPackage.metaDescription,
    publicationPackage.coverImageAltText,
  ].filter((value): value is string => typeof value === 'string').join(' ');
  return !isClearlyDifferentEditorialLanguage(prose, expected);
};
