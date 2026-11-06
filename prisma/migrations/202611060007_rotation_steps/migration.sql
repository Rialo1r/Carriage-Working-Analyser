CREATE TABLE "RotationStep" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "rotationId" UUID NOT NULL,
  "diagramId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dayOffset" INTEGER NOT NULL,
  UNIQUE ("rotationId", "sequence")
);

ALTER TABLE "RotationStep" ADD FOREIGN KEY ("rotationId") REFERENCES "Rotation" ("id") ON DELETE RESTRICT;

ALTER TABLE "RotationStep" ADD FOREIGN KEY ("diagramId") REFERENCES "Diagram" ("id") ON DELETE RESTRICT;
INSERT INTO "RotationStep" ("rotationId","diagramId","sequence","dayOffset")
SELECT r.id, (s.value->>'diagramId')::uuid, s.ordinality::integer, (s.value->>'dayOffset')::integer
FROM "Rotation" r CROSS JOIN LATERAL jsonb_array_elements(r.steps) WITH ORDINALITY s(value,ordinality)
JOIN "Diagram" d ON d.id = (s.value->>'diagramId')::uuid;
