'use client';

/**
 * Robust active route matcher taking locale prefixes (/en, /id) and matching strategies into account.
 */
export function isRouteActive(
  pathname: string | null | undefined,
  href: string,
  match: 'exact' | 'section' = 'exact'
): boolean {
  if (!pathname || !href) return false;

  // Remove locale prefix (e.g. /en/dashboard/overview -> /dashboard/overview)
  const cleanPathname = pathname.replace(/^\/(en|id)(\/|$)/, '/');
  const cleanHref = href.replace(/^\/(en|id)(\/|$)/, '/');

  if (match === 'exact') {
    return cleanPathname === cleanHref;
  }

  return (
    cleanPathname === cleanHref ||
    cleanPathname.startsWith(`${cleanHref}/`)
  );
}
