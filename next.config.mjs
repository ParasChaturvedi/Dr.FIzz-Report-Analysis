/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the headless-Chromium PDF packages external (native binaries / large
  // assets that must not be bundled by the Next.js compiler).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
