import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export const createDb = (url = process.env.DATABASE_URL) => {
  if (!url) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
};
export const formationInclude = {
  members: { include: { type: true }, orderBy: { position: "asc" as const } },
};
export const workingInclude = {
  diagram: { include: { period: true } },
  startStation: true,
  finishStation: true,
  formation: { include: formationInclude },
  calendar: { include: { exceptions: true } },
  routeCalls: {
    include: { station: true },
    orderBy: { sequence: "asc" as const },
  },
  instructions: true,
  sources: true,
  nextRules: {
    include: {
      targetWorking: {
        include: {
          diagram: { include: { period: true } },
          calendar: true,
          startStation: true,
          finishStation: true,
        },
      },
    },
    orderBy: { weekday: "asc" as const },
  },
  variations: { include: { formation: { include: formationInclude } } },
  changes: { include: { type: true } },
  researchNotes: { orderBy: { createdAt: "desc" as const } },
};
export const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export async function audit(
  tx: any,
  entityId: string,
  entityType: string,
  action: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  if (
    ![
      "Connection review",
      "Issue review",
      "Rotation review",
      "Physical set",
      "Manual assignment",
      "Rotation assignment",
      "Rotation",
    ].includes(entityType)
  )
    await tx.datasetState.upsert({
      where: { id: "main" },
      create: { id: "main", version: 1 },
      update: { version: { increment: 1 } },
    });
  return tx.auditEvent.create({
    data: {
      entityId,
      entityType,
      action,
      reason,
      ...(before == null ? {} : { before: json(before) }),
      ...(after == null ? {} : { after: json(after) }),
    },
  });
}
