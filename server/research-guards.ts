import { audit, json } from "./data.js";
import { checkedPair, loadOccurrence } from "./analysis-service.js";
import { httpError } from "./validation.js";
export async function guardLockedLink(tx: any, fromId: string) {
  const rotations = await tx.savedRotation.findMany({
    where: { active: true, locked: true },
  });
  if (
    rotations.some((r: any) =>
      (r.snapshot as any).nodes.some((n: any) => n.id === fromId),
    )
  )
    throw httpError(
      409,
      "A locked rotation uses this working. Unlock it with a research reason before changing the approved connection.",
    );
}

export async function approvePair(
  tx: any,
  fromId: string,
  toId: string,
  reason: string,
  acknowledge: boolean,
) {
  const from = await loadOccurrence(tx, fromId),
    to = await loadOccurrence(tx, toId),
    checked = await checkedPair(tx, from, to);
  if (checked.hasErrors)
    throw httpError(
      409,
      "This connection has contradictory entered information. Resolve the errors before approving it.",
    );
  if (!checked.fullyChecked && !acknowledge)
    throw httpError(
      400,
      "Acknowledge the remaining uncertainties before approving this hypothesis.",
    );
  const same = await tx.approvedConnection.findUnique({
    where: { fromId_toId: { fromId, toId } },
  });
  if (same?.active) return same;
  await guardLockedLink(tx, fromId);
  const existing = await tx.approvedConnection.findUnique({
    where: { fromKey: fromId },
  });
  if (existing && existing.toId !== toId)
    await tx.approvedConnection.update({
      where: { id: existing.id },
      data: { active: false, fromKey: null, targetExclusiveKey: null },
    });
  const target = to.working.exclusive
    ? await tx.approvedConnection.findUnique({
        where: { targetExclusiveKey: toId },
      })
    : null;
  if (target && target.fromId !== fromId)
    throw httpError(
      409,
      "Another approved stock chain already enters this exclusive dated working. Review it first.",
    );
  const row = await tx.approvedConnection.upsert({
    where: { fromId_toId: { fromId, toId } },
    create: {
      fromId,
      toId,
      fromKey: fromId,
      targetExclusiveKey: to.working.exclusive ? toId : null,
      reason,
      snapshot: json({ from, to, checked }),
    },
    update: {
      active: true,
      fromKey: fromId,
      targetExclusiveKey: to.working.exclusive ? toId : null,
      reason,
      snapshot: json({ from, to, checked }),
    },
  });
  await tx.connectionReview.upsert({
    where: { fromId_toId: { fromId, toId } },
    create: { fromId, toId, decision: "Approved", reason },
    update: { decision: "Approved", reason },
  });
  await audit(
    tx,
    from.workingId,
    "Connection review",
    "Approved",
    reason,
    same,
    row,
  );
  return row;
}
