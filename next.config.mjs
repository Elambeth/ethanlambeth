/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Private content is served by authenticated route handlers, never a static export.
  outputFileTracingIncludes: {
    "/what-is-this/api/[[...path]]": ["./private/what-is-this/**/*"],
  },
  async headers() {
    return [{
      source: "/what-is-this/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
