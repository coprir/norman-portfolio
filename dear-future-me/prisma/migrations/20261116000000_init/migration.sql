-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LETTER');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('PENDING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('NOT_SCANNED', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "CapsuleStatus" AS ENUM ('DRAFT', 'SEALING', 'LOCKED', 'AVAILABLE', 'OPENED');

-- CreateEnum
CREATE TYPE "CapsuleVisibility" AS ENUM ('PRIVATE', 'SHARED', 'FAMILY');

-- CreateEnum
CREATE TYPE "CapsuleKind" AS ENUM ('STANDARD', 'FUTURE_SELF');

-- CreateEnum
CREATE TYPE "RecipientPermission" AS ENUM ('VIEW', 'CONTRIBUTE');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SEAL', 'RELEASE', 'REMINDER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CAPSULE_CREATED', 'CAPSULE_LOCKED', 'CAPSULE_REMINDER', 'CAPSULE_UNLOCKED', 'CAPSULE_INVITE', 'CAPSULE_CONTRIBUTION', 'STORAGE_WARNING');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NONE', 'PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnswerPhase" AS ENUM ('THEN', 'NOW');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "password_hash" TEXT,
    "avatar_key" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "date_of_birth" DATE,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "ai_consent_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "storage_limit_bytes" BIGINT NOT NULL,
    "max_active_capsules" INTEGER,
    "max_file_size_bytes" BIGINT NOT NULL,
    "max_recipients" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "price_cents_monthly" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripe_price_env" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_reference" TEXT,
    "external_id" TEXT,
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "media_type" "MediaType" NOT NULL,
    "status" "MemoryStatus" NOT NULL DEFAULT 'PENDING',
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "in_vault" BOOLEAN NOT NULL DEFAULT true,
    "storage_key" TEXT,
    "thumbnail_key" TEXT,
    "upload_id" TEXT,
    "original_filename" TEXT,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "content" TEXT,
    "category_id" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capture_date" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_memories" (
    "album_id" TEXT NOT NULL,
    "memory_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_memories_pkey" PRIMARY KEY ("album_id","memory_id")
);

-- CreateTable
CREATE TABLE "capsules" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "kind" "CapsuleKind" NOT NULL DEFAULT 'STANDARD',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "message" TEXT,
    "category_id" TEXT,
    "cover_memory_id" TEXT,
    "cover_key" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'midnight',
    "unlock_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "schedule" JSONB,
    "capsule_status" "CapsuleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CapsuleVisibility" NOT NULL DEFAULT 'PRIVATE',
    "include_self" BOOLEAN NOT NULL DEFAULT true,
    "allow_contributions" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sealed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "seal_prefix" TEXT,
    "encryption_key_reference" TEXT,
    "sealed_content_manifest" JSONB,
    "content_integrity_hash" TEXT,
    "release_job_id" TEXT,
    "sealed_bytes" BIGINT NOT NULL DEFAULT 0,
    "item_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "capsules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_keys" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "kek_id" TEXT NOT NULL,
    "wrapped_key" BYTEA NOT NULL,
    "not_before" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "capsule_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_items" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "content" TEXT,
    "capture_date" TIMESTAMP(3),
    "storage_key" TEXT,
    "thumbnail_key" TEXT,
    "contributor_name" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "capsule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_events" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "prev_hash" TEXT,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsule_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_memories" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "memory_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "capsule_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_recipients" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "permission" "RecipientPermission" NOT NULL DEFAULT 'VIEW',
    "invitation_status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invite_token_hash" TEXT,
    "invited_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "release_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsule_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_contributions" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "memory_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsule_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_answers" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "phase" "AnswerPhase" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsule_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "capsule_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "email_status" "EmailStatus" NOT NULL DEFAULT 'NONE',
    "read_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "capsule_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "job_status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "provider_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_id" TEXT,
    "ip" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_token_hash_key" ON "tokens"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_user_id_type_idx" ON "tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_id_key" ON "subscriptions"("external_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_status_idx" ON "subscriptions"("plan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_key" ON "categories"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "memories_storage_key_key" ON "memories"("storage_key");

-- CreateIndex
CREATE INDEX "memories_user_id_in_vault_status_capture_date_idx" ON "memories"("user_id", "in_vault", "status", "capture_date");

-- CreateIndex
CREATE INDEX "memories_user_id_media_type_idx" ON "memories"("user_id", "media_type");

-- CreateIndex
CREATE INDEX "memories_tags_idx" ON "memories" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "albums_user_id_idx" ON "albums"("user_id");

-- CreateIndex
CREATE INDEX "album_memories_memory_id_idx" ON "album_memories"("memory_id");

-- CreateIndex
CREATE UNIQUE INDEX "capsules_seal_prefix_key" ON "capsules"("seal_prefix");

-- CreateIndex
CREATE INDEX "capsules_creator_id_capsule_status_idx" ON "capsules"("creator_id", "capsule_status");

-- CreateIndex
CREATE INDEX "capsules_capsule_status_unlock_at_idx" ON "capsules"("capsule_status", "unlock_at");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_keys_capsule_id_key" ON "capsule_keys"("capsule_id");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_items_storage_key_key" ON "capsule_items"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_items_capsule_id_display_order_key" ON "capsule_items"("capsule_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_events_capsule_id_seq_key" ON "capsule_events"("capsule_id", "seq");

-- CreateIndex
CREATE INDEX "capsule_memories_memory_id_idx" ON "capsule_memories"("memory_id");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_memories_capsule_id_memory_id_key" ON "capsule_memories"("capsule_id", "memory_id");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_recipients_invite_token_hash_key" ON "capsule_recipients"("invite_token_hash");

-- CreateIndex
CREATE INDEX "capsule_recipients_user_id_idx" ON "capsule_recipients"("user_id");

-- CreateIndex
CREATE INDEX "capsule_recipients_email_idx" ON "capsule_recipients"("email");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_recipients_capsule_id_email_key" ON "capsule_recipients"("capsule_id", "email");

-- CreateIndex
CREATE INDEX "capsule_contributions_contributor_id_idx" ON "capsule_contributions"("contributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_contributions_capsule_id_memory_id_key" ON "capsule_contributions"("capsule_id", "memory_id");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_answers_capsule_id_user_id_prompt_key_phase_key" ON "capsule_answers"("capsule_id", "user_id", "prompt_key", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_email_status_idx" ON "notifications"("email_status");

-- CreateIndex
CREATE INDEX "scheduled_jobs_job_status_scheduled_at_idx" ON "scheduled_jobs"("job_status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_capsule_id_type_variant_key" ON "scheduled_jobs"("capsule_id", "type", "variant");

-- CreateIndex
CREATE INDEX "email_logs_created_at_idx" ON "email_logs"("created_at");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_id_idx" ON "audit_logs"("resource_id");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_memories" ADD CONSTRAINT "album_memories_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_memories" ADD CONSTRAINT "album_memories_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_keys" ADD CONSTRAINT "capsule_keys_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_items" ADD CONSTRAINT "capsule_items_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_memories" ADD CONSTRAINT "capsule_memories_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_memories" ADD CONSTRAINT "capsule_memories_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_contributions" ADD CONSTRAINT "capsule_contributions_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_contributions" ADD CONSTRAINT "capsule_contributions_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_contributions" ADD CONSTRAINT "capsule_contributions_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_answers" ADD CONSTRAINT "capsule_answers_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_answers" ADD CONSTRAINT "capsule_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

