-- CreateTable
CREATE TABLE "telegram_pairing_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_pairing_codes_code_key" ON "telegram_pairing_codes"("code");

-- CreateIndex
CREATE INDEX "telegram_pairing_codes_userId_idx" ON "telegram_pairing_codes"("userId");

-- CreateIndex
CREATE INDEX "telegram_pairing_codes_expiresAt_idx" ON "telegram_pairing_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "telegram_pairing_codes_code_usedAt_expiresAt_idx" ON "telegram_pairing_codes"("code", "usedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "telegram_pairing_codes" ADD CONSTRAINT "telegram_pairing_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
