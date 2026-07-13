import 'dotenv/config';
import { prisma } from './lib/db';

async function run() {
  console.log("=== CHECKING ALL ORGANIZATIONS IN DATABASE ===");
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      }
    });

    for (const org of orgs) {
      console.log(`\nOrg Name: "${org.name}" (ID: ${org.id}, Slug: ${org.slug})`);
      
      const balances = await prisma.creditTransaction.groupBy({
        by: ['bucket'],
        where: {
          organizationId: org.id
        },
        _sum: {
          amount: true
        }
      });

      let total = 0;
      balances.forEach((b) => {
        const amt = b._sum.amount ?? 0;
        total += amt;
        console.log(`- ${b.bucket.toUpperCase()}: ${amt} Credits`);
      });
      console.log(`Total Remaining: ${total} Credits`);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
