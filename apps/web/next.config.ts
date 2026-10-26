import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// The browser only talks to `/api/*`, which is forwarded to the API, so the owner cookie stays first
// party. The origin is server-side configuration and is never sent to the browser.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // The repo's own AGENTS.md is the one set of agent rules.
  agentRules: false,
  async headers() {
    // A stale worker would keep showing old behaviour, so browsers must check for a new one each time.
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
