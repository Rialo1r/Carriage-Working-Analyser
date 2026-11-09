CREATE TABLE "AnalysisRun" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "periodId" UUID NOT NULL,
 "startDate" DATE NOT NULL,
 "endDate" DATE NOT NULL,
 "inputVersion" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("periodId", "startDate", "endDate")
);
CREATE TABLE "ConnectionProposal" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "analysisId" UUID NOT NULL,
 "fromId" UUID NOT NULL,
 "toId" UUID NOT NULL,
 "kind" TEXT NOT NULL,
 "classification" TEXT NOT NULL,
 "score" INTEGER NOT NULL,
 "checks" JSONB NOT NULL,
 "storage" JSONB,
 "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("analysisId", "fromId", "toId")
);
CREATE TABLE "ConnectionReview" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "fromId" UUID NOT NULL,
 "toId" UUID NOT NULL,
 "decision" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("fromId", "toId")
);
CREATE TABLE "ApprovedConnection" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "fromId" UUID NOT NULL,
 "toId" UUID NOT NULL,
 "fromKey" UUID UNIQUE,
 "targetExclusiveKey" UUID UNIQUE,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "reason" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("fromId", "toId")
);
CREATE TABLE "ConnectingMovement" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "fromId" UUID NOT NULL,
 "toId" UUID NOT NULL,
 "sequence" INTEGER NOT NULL,
 "startStationId" UUID,
 "finishStationId" UUID,
 "startDate" DATE NOT NULL,
 "finishDate" DATE NOT NULL,
 "startMinutes" INTEGER,
 "finishMinutes" INTEGER,
 "sourceTitle" TEXT NOT NULL DEFAULT '',
 "sourcePage" TEXT NOT NULL DEFAULT '',
 "notes" TEXT NOT NULL,
 "archived" BOOLEAN NOT NULL DEFAULT false,
 UNIQUE ("fromId", "toId", "sequence")
);
CREATE TABLE "PlanningIssue" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "key" TEXT NOT NULL UNIQUE,
 "analysisId" UUID NOT NULL,
 "code" TEXT NOT NULL,
 "severity" TEXT NOT NULL,
 "description" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "fromId" UUID,
 "toId" UUID,
 "workingId" UUID,
 "physicalSetId" UUID,
 "originalFinding" JSONB NOT NULL,
 "details" JSONB NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "reviewState" TEXT NOT NULL DEFAULT 'Open',
 "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "IssueReview" (
 "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 "issueId" UUID NOT NULL,
 "state" TEXT NOT NULL,
 "note" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "AnalysisRun" ADD FOREIGN KEY ("periodId") REFERENCES "HistoricalPeriod"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectionProposal" ADD FOREIGN KEY ("analysisId") REFERENCES "AnalysisRun"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectionProposal" ADD FOREIGN KEY ("fromId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectionProposal" ADD FOREIGN KEY ("toId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectionReview" ADD FOREIGN KEY ("fromId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectionReview" ADD FOREIGN KEY ("toId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ApprovedConnection" ADD FOREIGN KEY ("fromId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ApprovedConnection" ADD FOREIGN KEY ("toId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectingMovement" ADD FOREIGN KEY ("fromId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectingMovement" ADD FOREIGN KEY ("toId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectingMovement" ADD FOREIGN KEY ("startStationId") REFERENCES "Station"(id) ON DELETE RESTRICT;
ALTER TABLE "ConnectingMovement" ADD FOREIGN KEY ("finishStationId") REFERENCES "Station"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningIssue" ADD FOREIGN KEY ("analysisId") REFERENCES "AnalysisRun"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningIssue" ADD FOREIGN KEY ("fromId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningIssue" ADD FOREIGN KEY ("toId") REFERENCES "WorkingOccurrence"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningIssue" ADD FOREIGN KEY ("workingId") REFERENCES "WorkingDefinition"(id) ON DELETE RESTRICT;
ALTER TABLE "PlanningIssue" ADD FOREIGN KEY ("physicalSetId") REFERENCES "PhysicalSet"(id) ON DELETE RESTRICT;
ALTER TABLE "IssueReview" ADD FOREIGN KEY ("issueId") REFERENCES "PlanningIssue"(id) ON DELETE RESTRICT;
CREATE INDEX ON "PlanningIssue" ("analysisId",active,severity);
