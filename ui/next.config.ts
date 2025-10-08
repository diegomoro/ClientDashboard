import type { NextConfig } from "next";

const devCsp = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' ws:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
].join("; ");

const prodCsp = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "script-src-elem 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders() {
  const csp = process.env.NODE_ENV === "development" ? devCsp : prodCsp;
  return [
    {
      key: "Content-Security-Policy",
      value: csp,
    },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders(),
    },
  ],
};

export default nextConfig;
