-- CreateTable
CREATE TABLE "driver_photo_sessions" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "photoType" "PhotoType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_photo_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_photo_sessions_driverProfileId_key" ON "driver_photo_sessions"("driverProfileId");

-- CreateIndex
CREATE INDEX "driver_photo_sessions_driverProfileId_idx" ON "driver_photo_sessions"("driverProfileId");

-- CreateIndex
CREATE INDEX "driver_photo_sessions_expiresAt_idx" ON "driver_photo_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "driver_photo_sessions" ADD CONSTRAINT "driver_photo_sessions_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_photo_sessions" ADD CONSTRAINT "driver_photo_sessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
