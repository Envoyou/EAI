import 'dotenv/config';
import { prisma } from './lib/db';

async function run() {
  const orgId = 'cmqe534670001g4kh7bhi3y1p';
  console.log(`=== ANALYZING TRANSACTIONS FOR ORG E-BLOG: ${orgId} ===`);
  try {
    const txs = await prisma.creditTransaction.findMany({
      where: { organizationId: orgId },
      orderBy: { id: 'desc' },
      take: 20
    });

    console.log(`Recent 20 transactions:`);
    txs.forEach((t) => {
      console.log(`- ID: ${t.id} | BUCKET: ${t.bucket.toUpperCase()} | TYPE: ${t.type} | AMOUNT: ${t.amount} | USER: ${t.userId} | DESC: "${t.description}"`);
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
