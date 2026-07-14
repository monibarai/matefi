/**
 * MateFi frontend — Next.js 14 App Router.
 *
 * Note: the project skeleton lists `next.config.ts`, but Next.js 14.x only
 * supports .js/.mjs config files (TS config landed in Next 15). Same
 * configuration, different extension.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @stellar/stellar-sdk pulls in sodium-native optionally; keep webpack quiet
  // about optional native deps that are never used in the browser bundle.
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.externals = [...(config.externals ?? []), 'sodium-native', 'require-addon'];
    return config;
  },
};

export default nextConfig;
