/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the headless-Chromium PDF packages external (native binaries / large
  // assets that must not be bundled by the Next.js compiler).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // Force the @sparticuz/chromium binary AND its brotli-packed shared libraries
  // (libnss3.so etc.) into the download-pdf function bundle. Without this, Next's
  // file tracing prunes the lib packs → Chromium fails with
  // "libnss3.so: cannot open shared object file" and the route falls back to
  // (now-expired) ConvertAPI. Including the whole package fixes the launch.
  outputFileTracingIncludes: {
    "/api/report/download-pdf": ["./node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
