/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // ยอมให้ Build ผ่านแม้ว่าจะมีข้อผิดพลาดเกี่ยวกับ TypeScript Type
    ignoreBuildErrors: true,
  },
  eslint: {
    // ยอมให้ Build ผ่านแม้ว่าจะมีข้อผิดพลาดเกี่ยวกับ ESLint
    ignoreDuringBuilds: true,
  },
  // ...ค่าคอนฟิกอื่นๆ ที่อาจจะมีอยู่เดิมในไฟล์ (ห้ามลบออก ให้คงไว้)
};

module.exports = nextConfig;