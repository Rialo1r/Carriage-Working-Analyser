CREATE TABLE "AnalysisScenario" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "diagramIds" UUID[] NOT NULL,
  "assumptions" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DiagramTransition" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "scenarioId" UUID NOT NULL,
  "fromId" UUID NOT NULL,
  "toId" UUID NOT NULL,
  "dayOffset" INTEGER NOT NULL DEFAULT 1,
  "confidence" TEXT NOT NULL DEFAULT 'Unknown',
  "decision" TEXT NOT NULL DEFAULT 'Pending',
  "kind" TEXT NOT NULL DEFAULT 'Direct',
  "checks" JSONB NOT NULL,
  "evidenceId" UUID,
  "transferMovementId" UUID,
  "rationale" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("scenarioId", "fromId", "toId", "dayOffset")
);

CREATE TABLE "Rotation" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "scenarioId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "physicalSetId" UUID,
  "steps" JSONB NOT NULL,
  "repeats" BOOLEAN NOT NULL DEFAULT false,
  "periodDays" INTEGER,
  "status" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "DiagramTransition" ADD FOREIGN KEY ("scenarioId") REFERENCES "AnalysisScenario" ("id") ON DELETE RESTRICT;

ALTER TABLE "DiagramTransition" ADD FOREIGN KEY ("fromId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "DiagramTransition" ADD FOREIGN KEY ("toId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;

ALTER TABLE "Rotation" ADD FOREIGN KEY ("scenarioId") REFERENCES "AnalysisScenario" ("id") ON DELETE RESTRICT;
ALTER TABLE "DiagramTransition" ADD FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT;
ALTER TABLE "DiagramTransition" ADD FOREIGN KEY ("transferMovementId") REFERENCES "Movement"("id") ON DELETE RESTRICT;
ALTER TABLE "Rotation" ADD FOREIGN KEY ("physicalSetId") REFERENCES "PhysicalSet"("id") ON DELETE RESTRICT;
