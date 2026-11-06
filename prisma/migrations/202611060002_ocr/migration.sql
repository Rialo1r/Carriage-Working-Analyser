CREATE TABLE "OcrJob" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "pageId" UUID NOT NULL REFERENCES "DocumentPage"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'Queued', "rotation" INTEGER NOT NULL DEFAULT 0, "region" JSONB, "layout" INTEGER NOT NULL DEFAULT 6,
 "error" TEXT, "lockedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3), "rawText" TEXT, "confidence" DOUBLE PRECISION, "blocks" JSONB, "imageKey" TEXT
);
CREATE INDEX ON "OcrJob"("status", "createdAt");
CREATE TABLE "TranscriptionRevision" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "jobId" UUID NOT NULL REFERENCES "OcrJob"("id") ON DELETE RESTRICT,
 "text" TEXT NOT NULL, "notes" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "CorrectionRule" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "original" TEXT NOT NULL,
 "replacement" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT NOT NULL DEFAULT '');
