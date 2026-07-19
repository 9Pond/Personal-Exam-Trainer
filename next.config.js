/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // เพิ่ม hostname ของ Object Storage ที่ใช้จริง เช่น R2 public bucket domain
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // รองรับอัปโหลดรูป/PDF ขนาดกลาง
    },
  },
};

module.exports = nextConfig;
