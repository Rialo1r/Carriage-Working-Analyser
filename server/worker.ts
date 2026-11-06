import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { processOcrJob } from "./ocr.js";
import path from "node:path";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    stopping = true;
  });
// A lease can expire after worker interruption; a new immutable job is made by retry.
while (!stopping) {
  try {
    await db.ocrJob.updateMany({
      where: {
        status: "Running",
        lockedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      data: { status: "Failed", error: "Worker interrupted; retry this page." },
    });

    if (
      !(await processOcrJob(
        db,
        path.resolve(process.env.STORAGE_DIR || ".data"),
      ))
    )
      await new Promise((r) => setTimeout(r, 1000));
  } catch {
    console.error("OCR queue unavailable; retrying");
    await new Promise((r) => setTimeout(r, 3000));
  }
}
await db.$disconnect();
