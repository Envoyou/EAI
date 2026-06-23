import { PrismaClient, Prisma } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

// Dibutuhkan untuk environments Node.js (Next.js server)
neonConfig.webSocketConstructor = ws;

// Konfigurasi adapter Neon
const connectionString = process.env.DATABASE_URL || "postgres://dummy:dummy@dummy.neon.tech/dummy";
const adapter = new PrismaNeon({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma };
