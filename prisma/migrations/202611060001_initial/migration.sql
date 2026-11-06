-- Phase 1 foundation. Original evidence uses restrictive foreign keys.

CREATE TABLE "Document" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "sourceDate" TEXT,
  "operatingPeriod" TEXT,
  "region" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DocumentFile" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL UNIQUE,
  "sha256" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "pageCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DocumentPage" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "fileId" UUID NOT NULL,
  "pdfPage" INTEGER NOT NULL,
  "printedLabel" TEXT,
  UNIQUE ("fileId", "pdfPage")
);

CREATE TABLE "Evidence" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "pageId" UUID NOT NULL,
  "diagramId" UUID NOT NULL,
  "originalText" TEXT NOT NULL DEFAULT '',
  "transcription" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Station" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE "StationAlias" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "stationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  UNIQUE ("stationId", "name")
);

CREATE TABLE "Diagram" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID,
  "publishedNumber" TEXT,
  "title" TEXT,
  "operatingPeriod" TEXT,
  "operatingDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "calendarNotes" TEXT NOT NULL DEFAULT '',
  "compositionText" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'Not reviewed',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Movement" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "diagramId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "trainNumber" TEXT,
  "originId" UUID,
  "destinationId" UUID,
  "departureMinutes" INTEGER,
  "arrivalMinutes" INTEGER,
  "originalTimeText" TEXT NOT NULL DEFAULT '',
  "activity" TEXT NOT NULL DEFAULT 'Unknown',
  "notes" TEXT NOT NULL DEFAULT '',
  UNIQUE ("diagramId", "sequence")
);

CREATE TABLE "PhysicalSet" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "researchLabel" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE "Formation" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "physicalSetId" UUID,
  "description" TEXT NOT NULL
);

CREATE TABLE "CarriageType" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "description" TEXT
);

CREATE TABLE "Carriage" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "publishedNumber" TEXT NOT NULL,
  "typeId" UUID
);

CREATE TABLE "FormationMember" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "formationId" UUID NOT NULL,
  "position" INTEGER,
  "quantity" INTEGER,
  "carriageId" UUID,
  "typeId" UUID
);

CREATE TABLE "DiagramOperation" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "diagramId" UUID NOT NULL,
  "date" DATE,
  "scenarioDay" TEXT
);

CREATE TABLE "OperationAssignment" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "operationId" UUID NOT NULL,
  "formationId" UUID NOT NULL,
  "notes" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE "Verification" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "diagramId" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "researcher" TEXT NOT NULL DEFAULT 'Personal researcher',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "DocumentFile" ADD FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT;

ALTER TABLE "DocumentPage" ADD FOREIGN KEY ("fileId") REFERENCES "DocumentFile" ("id") ON DELETE RESTRICT;

ALTER TABLE "Evidence" ADD FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id") ON DELETE RESTRICT;

ALTER TABLE "Evidence" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "StationAlias" ADD FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT;

ALTER TABLE "Diagram" ADD FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT;

ALTER TABLE "Movement" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "Movement" ADD FOREIGN KEY ("originId") REFERENCES "Station" ("id") ON DELETE RESTRICT;

ALTER TABLE "Movement" ADD FOREIGN KEY ("destinationId") REFERENCES "Station" ("id") ON DELETE RESTRICT;

ALTER TABLE "Formation" ADD FOREIGN KEY ("physicalSetId") REFERENCES "PhysicalSet" ("id") ON DELETE RESTRICT;

ALTER TABLE "Carriage" ADD FOREIGN KEY ("typeId") REFERENCES "CarriageType" ("id") ON DELETE RESTRICT;

ALTER TABLE "FormationMember" ADD FOREIGN KEY ("formationId") REFERENCES "Formation" ("id") ON DELETE RESTRICT;

ALTER TABLE "FormationMember" ADD FOREIGN KEY ("carriageId") REFERENCES "Carriage" ("id") ON DELETE RESTRICT;

ALTER TABLE "FormationMember" ADD FOREIGN KEY ("typeId") REFERENCES "CarriageType" ("id") ON DELETE RESTRICT;

ALTER TABLE "DiagramOperation" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "OperationAssignment" ADD FOREIGN KEY ("operationId") REFERENCES "DiagramOperation" ("id") ON DELETE RESTRICT;

ALTER TABLE "OperationAssignment" ADD FOREIGN KEY ("formationId") REFERENCES "Formation" ("id") ON DELETE RESTRICT;

ALTER TABLE "Verification" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

CREATE INDEX ON "Diagram" ("documentId");

CREATE INDEX ON "Movement" ("originId", "destinationId");

CREATE INDEX ON "AuditEvent" ("entityId", "createdAt");
