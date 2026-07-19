import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ตัวอย่าง: seed หัวข้อพื้นฐานไว้ล่วงหน้า เพื่อให้ AI extraction
  // เลือกใช้ topic ที่มีอยู่แล้วก่อน แทนที่จะสร้างซ้ำซ้อนกันคนละชื่อ
  const topics = [
    { name: "Algebra", subject: "Mathematics" },
    { name: "Geometry", subject: "Mathematics" },
    { name: "Probability", subject: "Mathematics" },
    { name: "Grammar", subject: "English" },
    { name: "Vocabulary", subject: "English" },
  ];

  for (const topic of topics) {
    await prisma.topic.upsert({
      where: { name: topic.name },
      update: {},
      create: topic,
    });
  }

  console.log(`Seeded ${topics.length} topics.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
