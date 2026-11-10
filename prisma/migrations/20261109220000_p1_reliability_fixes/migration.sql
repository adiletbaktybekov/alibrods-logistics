-- Migration: 20261109220000_p1_reliability_fixes
-- Description: P1 Reliability & Security Fixes (Idempotency, Concurrency, Telegram Webhook Dedup, Distributed Rate Limit)
-- Target: PostgreSQL / Neon Staging

-- 1. Create Enum for Telegram Webhook Update Status
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

-- 2. Create Table for Server-Side Idempotency Keys
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "lockToken" TEXT,
    "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- Indexes for idempotency_keys
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");
CREATE INDEX "idempotency_keys_userId_action_idx" ON "idempotency_keys"("userId", "action");
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");
CREATE INDEX "idempotency_keys_lockToken_idx" ON "idempotency_keys"("lockToken");

-- Foreign key for idempotency_keys
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Create Partial Unique Index for Active Driver Assignments (P1-2 Concurrency Protection)
-- Ensures that at most ONE driver can hold an active assignment ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS') on a given order.
CREATE UNIQUE INDEX "unique_order_active_assignment" ON "order_assignments"("orderId")
WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS');

-- 4. Create Table for Distributed Telegram Webhook Deduplication (P1-3)
CREATE TABLE "telegram_processed_updates" (
    "id" TEXT NOT NULL,
    "botType" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_processed_updates_pkey" PRIMARY KEY ("id")
);

-- Indexes for telegram_processed_updates
CREATE UNIQUE INDEX "telegram_processed_updates_botType_updateId_key" ON "telegram_processed_updates"("botType", "updateId");
CREATE INDEX "telegram_processed_updates_expiresAt_idx" ON "telegram_processed_updates"("expiresAt");

-- 5. Create Table for Distributed Rate Limiting (P1-4)
CREATE TABLE "rate_limit_entries" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("id")
);

-- Indexes for rate_limit_entries
CREATE UNIQUE INDEX "rate_limit_entries_key_key" ON "rate_limit_entries"("key");
CREATE INDEX "rate_limit_entries_expiresAt_idx" ON "rate_limit_entries"("expiresAt");
