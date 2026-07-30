export const PROMPT_VERSION = '2.8.0';

export const EDITORIAL_TIME_ZONE = 'Asia/Jakarta';

export const getCurrentEditorialDate = (timezone = EDITORIAL_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
};
