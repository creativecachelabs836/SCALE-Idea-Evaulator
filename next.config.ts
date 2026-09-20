import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 and playwright-core are native/heavy server-only deps; keep them
  // outside the bundler so the API routes load them from node_modules at runtime.
  serverExternalPackages: ['better-sqlite3', 'playwright-core'],
  experimental: {
    // The report route streams a large canonical object into the print template.
    largePageDataBytes: 5 * 1024 * 1024,
  },
};

export default nextConfig;
