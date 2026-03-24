import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const requests = await prisma.customBuildRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log("Found requests:", JSON.stringify(requests, null, 2));
  } catch(e) {
    console.log("Error finding requests:", e.message);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
