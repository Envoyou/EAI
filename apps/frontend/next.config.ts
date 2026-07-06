import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sentry/nextjs", "import-in-the-middle", "require-in-the-middle"],
  images: {
    remotePatterns: [
      // Clerk-hosted avatars
      { protocol: "https", hostname: "img.clerk.com" },
      // Google OAuth profile pictures
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // GitHub OAuth avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      // Generic Gravatar fallbacks
      { protocol: "https", hostname: "www.gravatar.com" },
      { protocol: "https", hostname: "gravatar.com" },
    ],
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
});
