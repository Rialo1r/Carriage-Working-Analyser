CREATE TABLE "ChainProposal" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "analysisId" UUID NOT NULL REFERENCES "AnalysisRun"("id"),
 "signature" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'Proposed', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("analysisId", "signature")
);
CREATE TABLE "SavedRotation" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "proposalId" UUID NOT NULL UNIQUE REFERENCES "ChainProposal"("id"),
 "physicalSetId" UUID NOT NULL REFERENCES "PhysicalSet"("id"), "name" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "locked" BOOLEAN NOT NULL DEFAULT true, "active" BOOLEAN NOT NULL DEFAULT true, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
