CREATE TABLE "CalendarRule" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "diagramId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "operates" BOOLEAN NOT NULL,
  "notes" TEXT NOT NULL,
  UNIQUE ("diagramId", "date")
);

CREATE TABLE "MovementCall" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "movementId" UUID NOT NULL,
  "stationId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "arrivalMinutes" INTEGER,
  "departureMinutes" INTEGER,
  "originalText" TEXT NOT NULL DEFAULT '',
  UNIQUE ("movementId", "sequence")
);

CREATE TABLE "CompositionRequirement" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "diagramId" UUID NOT NULL,
  "typeCode" TEXT,
  "quantity" INTEGER,
  "position" INTEGER,
  "notes" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE "CompositionChange" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "movementId" UUID NOT NULL,
  "afterMovement" BOOLEAN NOT NULL DEFAULT true,
  "action" TEXT NOT NULL,
  "typeCode" TEXT,
  "quantity" INTEGER,
  "notes" TEXT NOT NULL
);

CREATE TABLE "ResearchNote" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "diagramId" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "CalendarRule" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "MovementCall" ADD FOREIGN KEY ("movementId") REFERENCES "Movement" ("id") ON DELETE RESTRICT;

ALTER TABLE "MovementCall" ADD FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE RESTRICT;

ALTER TABLE "CompositionRequirement" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "CompositionChange" ADD FOREIGN KEY ("movementId") REFERENCES "Movement" ("id") ON DELETE RESTRICT;

ALTER TABLE "ResearchNote" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;
ALTER TABLE "CarriageType" ADD "seatingClass" TEXT, ADD "seats" INTEGER, ADD "brake" BOOLEAN, ADD "catering" TEXT, ADD "lengthMetres" DOUBLE PRECISION;
