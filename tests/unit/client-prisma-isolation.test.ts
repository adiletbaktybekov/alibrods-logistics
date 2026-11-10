import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function findClientFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findClientFiles(fullPath));
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      const text = fs.readFileSync(fullPath, "utf8");
      if (text.includes("'use client'") || text.includes('"use client"')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

describe("STEP 7.9.4: Strict Browser & Client Bundle Prisma Isolation", () => {
  it("ensures database/prisma.ts explicitly declares server-only import", () => {
    const prismaFile = fs.readFileSync("database/prisma.ts", "utf8");
    expect(prismaFile).toMatch(/^import ['"]server-only['"];/m);
  });

  it("ensures modules/warehouses/warehouses.types.ts has zero imports from Prisma or database", () => {
    const typesFile = fs.readFileSync("modules/warehouses/warehouses.types.ts", "utf8");
    expect(typesFile).not.toContain("@prisma/client");
    expect(typesFile).not.toContain("prisma");
    expect(typesFile).not.toContain("@/database/prisma");
  });

  it("scans all use client components and verifies NONE import database/prisma", () => {
    const clientFiles = [
      ...findClientFiles("app"),
      ...findClientFiles("components"),
    ];

    expect(clientFiles.length).toBeGreaterThan(0);

    for (const filePath of clientFiles) {
      const code = fs.readFileSync(filePath, "utf8");
      expect(code).not.toMatch(/from ['"][^'"]*database\/prisma['"]/);
      expect(code).not.toContain("PrismaClient");
    }
  });

  it("verifies order-form.tsx imports warehouse helpers from warehouses.types, not warehouses.service", () => {
    const orderFormCode = fs.readFileSync("app/(client)/orders/new/order-form.tsx", "utf8");
    expect(orderFormCode).toContain("@/modules/warehouses/warehouses.types");
    expect(orderFormCode).not.toContain("@/modules/warehouses/warehouses.service");
  });

  it("verifies miniapp-order-form.tsx imports warehouse helpers from warehouses.types, not warehouses.service", () => {
    const miniappFormCode = fs.readFileSync("components/miniapp/miniapp-order-form.tsx", "utf8");
    expect(miniappFormCode).toContain("@/modules/warehouses/warehouses.types");
    expect(miniappFormCode).not.toContain("@/modules/warehouses/warehouses.service");
  });
});
