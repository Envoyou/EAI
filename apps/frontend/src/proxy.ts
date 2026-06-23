import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getMiddlewareFeatureFlags } from '@eai/shared/server';
import { getApiUrl } from '@/lib/api-url';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const isPublicRoute = createRouteMatcher([
  '/:locale?',
  '/:locale?/demo',
  '/:locale?/login(.*)',
  '/:locale?/signup(.*)',
  '/:locale?/pricing',
  '/:locale?/maintenance',
  '/:locale?/unavailable',
  '/:locale?/support',
  '/:locale?/legal(.*)',
  '/api/support',
  '/api/webhooks/clerk(.*)',
  '/api/webhooks/payment(.*)',
  '/api/analytics/webhook(.*)',
  '/api/analyze(.*)',
  '/api/draft(.*)',
  '/api/checkout',
  '/api/payments/status',
  '/api/workspace/config',
  '/api/public-stats(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute) {
    const token = await (async () => {
      try {
        const authObj = await auth();
        return await authObj.getToken();
      } catch {
        return null;
      }
    })();

    const targetUrl = new URL(
      pathname + request.nextUrl.search,
      getApiUrl()
    );

    const headers = new Headers(request.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return NextResponse.rewrite(targetUrl, {
      request: {
        headers,
      },
    });
  }

  // Remove locale prefix for feature flag bypass checks
  const pathWithoutLocale = pathname.replace(/^\/(en|id)/, '') || '/';
  
  const featureFlagReadBypass =
    pathWithoutLocale === '/maintenance' ||
    pathWithoutLocale === '/unavailable' ||
    pathWithoutLocale.startsWith('/support') ||
    pathWithoutLocale.startsWith('/legal') ||
    pathWithoutLocale.startsWith('/login') ||
    pathWithoutLocale.startsWith('/settings/system/feature-flags');

  if (featureFlagReadBypass) {
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
    return intlMiddleware(request);
  }

  const featureFlags = await getMiddlewareFeatureFlags();

  if (featureFlags.maintenance_mode && !isApiRoute) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  if (!featureFlags.signup_enabled && pathWithoutLocale.startsWith('/signup')) {
    return NextResponse.redirect(new URL('/unavailable?feature=signup', request.url));
  }

  if (!featureFlags.pricing_enabled && pathWithoutLocale === '/pricing') {
    return NextResponse.redirect(new URL('/unavailable?feature=pricing', request.url));
  }

  if (!featureFlags.demo_enabled && pathWithoutLocale === '/') {
    await auth.protect();
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Apply next-intl middleware for all non-API routes
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.[\\w]+$|_next/image|favicon.ico|apple-icon.png|icon.svg).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
