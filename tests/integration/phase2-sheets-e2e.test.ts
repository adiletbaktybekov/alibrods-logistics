import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/database/prisma";
import { OrderStatus } from "@prisma/client";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { OrdersService } from "@/modules/orders/orders.service";
import { getGoogleSheetsClient, resetGoogleSheetsClient, GoogleSheetsSyncRecord } from "@/integrations/google-sheets/client";
import crypto from "crypto";

const rawDbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const isStagingDb = rawDbUrl.includes("alibros_staging");
const describeLive = isStagingDb ? describe : describe.skip;

async function getAccessToken(serviceAccountEmail: string, privateKey: string) {
  let key = privateKey.trim();
  if ((key.startsWith("\"") && key.endsWith("\"")) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  const formattedKey = key.replace(/\\n/g, "\n").trim();

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + payload);
  const signature = signer.sign(formattedKey, "base64url");
  const assertion = header + "." + payload + "." + signature;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error("Google OAuth2 token error: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token as string;
}

describeLive("Google Sheets Integration — Phase 2: Controlled E2E Export & Import", { timeout: 60000 }, () => {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || "Заявки";
  const targetSheetGid = 1913927866;

  let accessToken = "";
  let clientUser: any;
  let managerUser: any;
  let warehouse: any;

  // Test Order Identity
  const testUid = Date.now().toString(36).toUpperCase();
  const testOrderNumber = "AB-SHEETS-TEST-" + testUid;
  const testIk = "ik-sheets-test-" + testUid;
  let testOrderId = "";
  let testRowNumberInSheet = 0;
  let initialRowsCount = 2;

  beforeAll(async () => {
    // -------------------------------------------------------------------------
    // STEP 1: PRE-CHECK — SAFETY & INTEGRITY GUARDS
    // -------------------------------------------------------------------------
    const u = new URL(rawDbUrl);
    const dbName = u.pathname.replace(/^\//, "");
    if (dbName !== "alibros_staging") {
      throw new Error("[SAFETY GUARD FAILURE] Forbidden database: " + dbName);
    }

    if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
      throw new Error("Google Sheets credentials missing in environment!");
    }

    accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    expect(accessToken).toBeDefined();

    // Verify baseline TC-E01 in Neon Staging
    const tcE01 = await prisma.order.findUnique({
      where: { orderNumber: "AB-20261109-3783" },
      include: {
        items: true,
        assignments: { include: { driver: true } },
        statusHistory: true,
        photos: true,
      },
    });

    expect(tcE01).not.toBeNull();
    expect(tcE01?.status).toBe(OrderStatus.DELIVERED_TO_WAREHOUSE);
    expect(tcE01?.items.length).toBe(3);
    expect(tcE01?.statusHistory.length).toBe(7);

    // Verify Cloudflare R2 photo
    const s3 = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    });
    const headRes = await s3.send(
      new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: tcE01!.photos[0].fileKey || undefined,
      })
    );
    expect(headRes.ContentLength).toBe(534);

    const tcE01Exists = await prisma.order.findUnique({ where: { orderNumber: 'AB-20261109-3783' } });
    expect(tcE01Exists).not.toBeNull();

    // Read initial Google Sheets rows
    resetGoogleSheetsClient();
    const sheetsClient = getGoogleSheetsClient();
    const initialRows = await sheetsClient.readAllRows();
    initialRowsCount = initialRows.length;
    expect(initialRowsCount).toBe(2); // Row 1: Header, Row 2: TC-E01

    // Seed test users & warehouse
    const clientRecord = await prisma.user.findUnique({
      where: { email: "client.test@alibros.local" },
      include: { clientProfile: true },
    });
    expect(clientRecord?.clientProfile).toBeDefined();
    clientUser = {
      id: clientRecord!.id,
      role: clientRecord!.role,
      email: clientRecord!.email,
    };

    const managerRecord = await prisma.user.findUnique({
      where: { email: "manager.test@alibros.local" },
    });
    expect(managerRecord).not.toBeNull();
    managerUser = {
      id: managerRecord!.id,
      role: managerRecord!.role,
      email: managerRecord!.email,
    };

    warehouse = await prisma.warehouse.findFirst({ where: { code: "WB_KOLEDINO" } });
    expect(warehouse).not.toBeNull();
  });

  afterAll(async () => {
    // -------------------------------------------------------------------------
    // STEP 8: CLEANUP — STRICT REMOVAL OF ONLY TEST DATA
    // -------------------------------------------------------------------------
    if (testRowNumberInSheet > 0) {
      try {
        const rowCheckRes = await fetch(
          "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(
            sheetName + "!A" + testRowNumberInSheet + ":B" + testRowNumberInSheet
          ),
          {
            headers: { Authorization: "Bearer " + accessToken },
          }
        );
        const rowCheckData = await rowCheckRes.json();
        const rowVals = rowCheckData.values?.[0] || [];

        if (rowVals[0] === testOrderId || rowVals[1] === testOrderNumber) {
          const deleteBatchUrl = "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + ":batchUpdate";
          await fetch(deleteBatchUrl, {
            method: "POST",
            headers: {
              Authorization: "Bearer " + accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: targetSheetGid,
                      dimension: "ROWS",
                      startIndex: testRowNumberInSheet - 1,
                      endIndex: testRowNumberInSheet,
                    },
                  },
                },
              ],
            }),
          });
        }
      } catch (err) {
        console.error("Error cleaning up Google Sheets row:", err);
      }
    }

    if (testOrderId) {
      await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: testOrderId } });
      await prisma.auditLog.deleteMany({ where: { resource: "Order", resourceId: testOrderId } });
      await prisma.order.deleteMany({ where: { id: testOrderId } });
      await prisma.idempotencyKey.deleteMany({ where: { key: testIk } });
    }

    // Verify baseline TC-E01 intact
    const tcE01Post = await prisma.order.findUnique({
      where: { orderNumber: "AB-20261109-3783" },
    });
    expect(tcE01Post?.status).toBe(OrderStatus.DELIVERED_TO_WAREHOUSE);

    // Verify test order is deleted
    const testOrderPost = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(testOrderPost).toBeNull();

    // Verify final rows in Google Sheets
    resetGoogleSheetsClient();
    const sheetsClient = getGoogleSheetsClient();
    const finalRows = await sheetsClient.readAllRows();
    expect(finalRows.length).toBe(initialRowsCount);
  });

  // ==========================================================================
  // STAGE 1: CREATE TEST ORDER VIA APPLICATION SERVICE LAYER
  // ==========================================================================
  it("1. Создание и подтверждение тестовой заявки через сервисный слой", async () => {
    const createdOrder = await OrdersService.createFromClient(clientUser, {
      orderNumber: testOrderNumber,
      warehouseId: warehouse.id,
      deliveryDate: new Date("2026-11-25T10:00:00Z"),
      totalBoxesCount: 2,
      totalPalletsCount: 0,
      clientComment: "Controlled E2E Google Sheets Test (Phase 2)",
      idempotencyKey: testIk,
    });

    testOrderId = createdOrder.id;
    expect(createdOrder.orderNumber).toBe(testOrderNumber);
    expect(createdOrder.status).toBe(OrderStatus.CREATED);

    // Confirm via manager to make exportable (status NOT IN [CREATED, CANCELLED])
    const confirmedOrder = await OrdersService.confirmOrder(
      managerUser,
      createdOrder.id,
      "Тестовое подтверждение для Phase 2"
    );
    expect(confirmedOrder.status).toBe(OrderStatus.CONFIRMED);

    const orderInDb = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(orderInDb).not.toBeNull();
    expect(orderInDb?.status).toBe(OrderStatus.CONFIRMED);
  });

  // ==========================================================================
  // STAGE 2: REAL EXPORT TO GOOGLE SHEETS
  // ==========================================================================
  it("2. Реальный точечный экспорт заявки в Google Sheets", async () => {
    resetGoogleSheetsClient();
    const sheetsClient = getGoogleSheetsClient();

    // Verify not present before export
    const beforeRows = await sheetsClient.readAllRows();
    const existing = beforeRows.find((r) => r[0] === testOrderId || r[1] === testOrderNumber);
    expect(existing).toBeUndefined();

    const syncRecord: GoogleSheetsSyncRecord = {
      orderId: testOrderId,
      orderNumber: testOrderNumber,
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      clientCompany: "ООО «Тест Логистик»",
      contactPerson: "Тест Бухгалтерия",
      contactPhone: "+79998887766",
      warehouseName: "Коледино",
      scheduledPickupDate: "2026-11-25",
      boxesCount: 2,
      palletsCount: 0,
      status: "Подтвержден",
      deliveryCostAmount: null,
      currency: "RUB",
      updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    };

    const res = await sheetsClient.exportOrders([syncRecord]);
    expect(res.exported).toBe(1);
    expect(res.updated).toBe(0);

    const afterRows = await sheetsClient.readAllRows();
    expect(afterRows.length).toBe(beforeRows.length + 1);

    const testIdx = afterRows.findIndex((r) => r[0] === testOrderId || r[1] === testOrderNumber);
    expect(testIdx).toBeGreaterThanOrEqual(1);
    testRowNumberInSheet = testIdx + 1; // 1-based row number

    const row = afterRows[testIdx];
    expect(row[0]).toBe(testOrderId);
    expect(row[1]).toBe(testOrderNumber);
    expect(row[3]).toBe("ООО «Тест Логистик»");
    expect(row[4]).toBe("Тест Бухгалтерия");
    expect(row[5].replace(/^\+/, '')).toBe('79998887766');
    expect(row[6]).toBe("Коледино");
    expect(row[7]).toBe("2026-11-25");
    expect(row[8]).toBe("2");
    expect(row[9]).toBe("0");
    expect(row[10]).toBe("Подтвержден");
    expect(row[11] || "").toBe(""); // Initially empty cost
    expect(row[12] || "").toBe("RUB");
    expect(row[13]).toBeDefined(); // Updated timestamp
  });

  // ==========================================================================
  // STAGE 3: POPULATE ACCOUNTING FIELDS L:M IN GOOGLE SHEETS
  // ==========================================================================
  it("3. Заполнение стоимости бухгалтером в Google Sheets (Cols L:M = 1250 RUB)", async () => {
    expect(testRowNumberInSheet).toBeGreaterThan(0);

    const updateRange = sheetName + "!L" + testRowNumberInSheet + ":M" + testRowNumberInSheet;
    const updateUrl = "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(
      updateRange
    ) + "?valueInputOption=USER_ENTERED";

    const putRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [["1250", "RUB"]],
      }),
    });

    expect(putRes.ok).toBe(true);

    // Read back row
    const readRowRes = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(
        sheetName + "!A" + testRowNumberInSheet + ":N" + testRowNumberInSheet
      ),
      {
        headers: { Authorization: "Bearer " + accessToken },
      }
    );
    const readRowData = await readRowRes.json();
    const verifiedRow = readRowData.values[0];

    expect(verifiedRow[11]).toBe("1250");
    expect(verifiedRow[12]).toBe("RUB");
    expect(verifiedRow[1]).toBe(testOrderNumber);
    expect(verifiedRow[0]).toBe(testOrderId);
  });

  // ==========================================================================
  // STAGE 4: REAL TARGETED IMPORT TO NEON STAGING
  // ==========================================================================
  it("4. Реальный импорт стоимости доставки в Neon Staging", async () => {
    resetGoogleSheetsClient();
    const sheetsClient = getGoogleSheetsClient();

    const costUpdates = await sheetsClient.fetchOrderCosts();
    const targetCost = costUpdates.find((c) => c.orderNumber === testOrderNumber || c.orderId === testOrderId);
    expect(targetCost).toBeDefined();
    expect(targetCost?.deliveryCostAmount).toBe(1250);
    expect(targetCost?.currency).toBe("RUB");

    const updateRes = await OrdersService.updateDeliveryCost(managerUser, targetCost!);
    expect(updateRes.isUpdated).toBe(true);

    const orderInDb = await prisma.order.findUnique({
      where: { id: testOrderId },
      select: { deliveryCostAmount: true, currency: true },
    });
    expect(Number(orderInDb?.deliveryCostAmount)).toBe(1250);
    expect(orderInDb?.currency).toBe("RUB");

    // TC-E01 delivery cost remains null
    const tcE01 = await prisma.order.findUnique({
      where: { orderNumber: "AB-20261109-3783" },
      select: { deliveryCostAmount: true },
    });
    expect(tcE01?.deliveryCostAmount).toBeNull();
  });

  // ==========================================================================
  // STAGE 5: OVERWRITE PROTECTION (RE-EXPORT & RE-IMPORT)
  // ==========================================================================
  it("5. Защита бухгалтерских данных при повторном экспорте и импорте", async () => {
    resetGoogleSheetsClient();
    const sheetsClient = getGoogleSheetsClient();

    const syncRecord: GoogleSheetsSyncRecord = {
      orderId: testOrderId,
      orderNumber: testOrderNumber,
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      clientCompany: "ООО «Тест Логистик»",
      contactPerson: "Тест Бухгалтерия",
      contactPhone: "+79998887766",
      warehouseName: "Коледино",
      scheduledPickupDate: "2026-11-25",
      boxesCount: 2,
      palletsCount: 0,
      status: "Подтвержден",
      deliveryCostAmount: null, // Operational export does not overwrite accountant entry!
      currency: "RUB",
      updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    };

    const reExportRes = await sheetsClient.exportOrders([syncRecord]);
    expect(reExportRes.exported).toBe(0);
    expect(reExportRes.updated).toBe(1);

    // Read back sheet: Col L must still be 1250!
    const reCheckedRows = await sheetsClient.readAllRows();
    const testRow = reCheckedRows.find((r) => r[0] === testOrderId || r[1] === testOrderNumber);
    expect(testRow).toBeDefined();
    expect(testRow![11]).toBe("1250");
    expect(testRow![12]).toBe("RUB");

    // Re-import should be idempotent
    const costUpdates = await sheetsClient.fetchOrderCosts();
    const targetCost = costUpdates.find((c) => c.orderNumber === testOrderNumber || c.orderId === testOrderId);
    expect(targetCost).toBeDefined();

    const reImportRes = await OrdersService.updateDeliveryCost(managerUser, targetCost!);
    expect(reImportRes.isUpdated).toBe(false); // Already 1250, no change!

    const orderInDb = await prisma.order.findUnique({
      where: { id: testOrderId },
      select: { deliveryCostAmount: true },
    });
    expect(Number(orderInDb?.deliveryCostAmount)).toBe(1250);
  });
});
