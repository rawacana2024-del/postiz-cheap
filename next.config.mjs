/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by Prisma Compute: it runs the standalone server `next build` emits.
  output: "standalone",
};

export default nextConfig;
