CREATE TABLE "ExportBatch" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "format" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "warnings" JSONB NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
