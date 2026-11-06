CREATE TABLE "TrainService" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "publishedNumber" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "operatingDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "TimetableEntry" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "serviceId" UUID NOT NULL,
  "stationId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "arrivalMinutes" INTEGER,
  "departureMinutes" INTEGER,
  "pageId" UUID,
  "originalText" TEXT NOT NULL DEFAULT '',
  UNIQUE ("serviceId", "sequence")
);

CREATE TABLE "MovementServiceLink" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "movementId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'Pending',
  "discrepancies" JSONB NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("movementId", "serviceId")
);

CREATE TABLE "ImportBatch" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "format" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "issues" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Preview',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3)
);

CREATE TABLE "ImportRecord" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "batchId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "rowKey" TEXT NOT NULL
);

ALTER TABLE "TrainService" ADD FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT;

ALTER TABLE "TimetableEntry" ADD FOREIGN KEY ("serviceId") REFERENCES "TrainService" ("id") ON DELETE RESTRICT;

ALTER TABLE "TimetableEntry" ADD FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT;

ALTER TABLE "MovementServiceLink" ADD FOREIGN KEY ("movementId") REFERENCES "Movement" ("id") ON DELETE RESTRICT;

ALTER TABLE "MovementServiceLink" ADD FOREIGN KEY ("serviceId") REFERENCES "TrainService" ("id") ON DELETE RESTRICT;

ALTER TABLE "ImportRecord" ADD FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE RESTRICT;
ALTER TABLE "TimetableEntry" ADD FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE RESTRICT;
ALTER TABLE "ImportBatch" ADD FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT;
ALTER TABLE "ImportRecord" ADD FOREIGN KEY ("serviceId") REFERENCES "TrainService"("id") ON DELETE RESTRICT;
