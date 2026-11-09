import React, { useEffect, useState } from "react";
import {
  api,
  Row,
  SaveForm,
  Input,
  Text,
  Modal,
  formValues,
  days,
} from "./common";
export function RotationPlans({ run, catalog, openWorking }: any) {
  const [proposals, setProposals] = useState<Row[]>([]),
    [saved, setSaved] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [locking, setLocking] = useState<Row | null>(null),
    [error, setError] = useState("");
  const allSets = [
    ...new Map(
      [...catalog.sets, ...saved.map((r) => r.physicalSet)].map((s) => [
        s.id,
        s,
      ]),
    ).values(),
  ];
  async function load() {
    setSaved(await api("/rotations"));
    if (run) setProposals(await api(`/analysis/${run.id}/chains`));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [run?.id]);
  const display = (r: Row) => {
    const s = r.snapshot;
    return (
      <>
        <p>
          {s.repeatDays
            ? `${s.repeatDays}-day repeating pattern supported across this analysis`
            : "Repeat period not established"}{" "}
          · {s.nodes.length} dated workings
        </p>
        {s.warnings.map((w: string, i: number) => (
          <p key={i} className="notice">
            {w}
          </p>
        ))}
        <div className="rotation-chain">
          {s.nodes.map((n: Row, i: number) => (
            <React.Fragment key={n.id}>
              {i > 0 && (
                <div className="chain-link">
                  ↓{" "}
                  {s.links[i - 1]?.approved ? "Research approved" : "Proposed"}
                  {s.links[i - 1]?.storage && (
                    <p>
                      Stabled at {s.links[i - 1].storage.stationName}
                      <br />
                      {s.links[i - 1].storage.fromDate} →{" "}
                      {s.links[i - 1].storage.toDate}
                    </p>
                  )}
                </div>
              )}
              <button
                className="chain-node"
                onClick={() => openWorking(n.workingId)}
              >
                <strong>
                  {n.date.slice(0, 10)} · Set {n.working.diagram.number}
                </strong>
                <span>
                  {n.working.startStation?.name || "?"} →{" "}
                  {n.working.finishStation?.name || "?"}
                </span>
                {n.working.instructions
                  .filter(
                    (x: Row) =>
                      !x.weekdays.length ||
                      x.weekdays.includes(
                        (new Date(n.date).getUTCDay() + 6) % 7,
                      ),
                  )
                  .map((x: Row) => (
                    <small key={x.id}>{x.text}</small>
                  ))}
              </button>
            </React.Fragment>
          ))}
        </div>
      </>
    );
  };
  return (
    <section>
      <h2>Rotation proposals</h2>
      <p>
        Generation follows explicit instructions and approved connections.
        Unselected candidates remain alternatives. Saving assigns only the dated
        workings shown; it does not extend a pattern indefinitely.
      </p>
      {run && (
        <button
          className="primary"
          disabled={run.stale}
          onClick={() =>
            void api(`/analysis/${run.id}/chains`, "POST", {})
              .then(setProposals)
              .catch((e) => setError(e.message))
          }
        >
          Generate Rotations
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {proposals.map((p) => (
        <details className="panel" key={p.id}>
          <summary>
            {p.snapshot.nodes[0]?.working.diagram.number} ·{" "}
            {p.snapshot.nodes[0]?.date.slice(0, 10)} · {p.snapshot.nodes.length}{" "}
            workings · {p.status}
          </summary>
          {display(p)}
          {p.status === "Proposed" && (
            <>
              <button onClick={() => setSelected(p)}>
                Approve & assign physical set
              </button>
              <SaveForm
                title="Reject proposal"
                onSave={async (form) => {
                  await api(`/chains/${p.id}/reject`, "POST", {
                    reason: formValues(form).reason,
                  });
                  await load();
                }}
              >
                <Input label="Reason for rejecting" name="reason" required />
              </SaveForm>
            </>
          )}
        </details>
      ))}
      <h2>Approved physical-set rotations</h2>
      {saved.length === 0 && <p>No approved rotations yet.</p>}
      {saved.map((r) => (
        <details className="panel" key={r.id}>
          <summary>
            {r.physicalSet.code} · {r.name} · {r.locked ? "Locked" : "Unlocked"}
          </summary>
          <p>{r.reason}</p>
          <p>
            The saved research snapshot is retained when the roster is edited.
            Compare it with a fresh proposal before changing your conclusions.
          </p>
          <button onClick={() => setLocking(r)}>
            {r.locked ? "Unlock" : "Lock"} rotation
          </button>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Week beginning</th>
                  {days.map((d) => (
                    <th key={d}>{d.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set<string>(
                    r.snapshot.nodes.map((n: Row) => {
                      const d = new Date(n.date);
                      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
                      return d.toISOString().slice(0, 10);
                    }),
                  ),
                ).map((monday) => (
                  <tr key={monday}>
                    <th>{monday}</th>
                    {days.map((d, i) => {
                      const date = new Date(monday);
                      date.setUTCDate(date.getUTCDate() + i);
                      const key = date.toISOString().slice(0, 10),
                        nodes = r.snapshot.nodes.filter(
                          (n: Row) => n.date.slice(0, 10) === key,
                        ),
                        storage = r.snapshot.links.find(
                          (l: Row) =>
                            l.storage &&
                            l.storage.fromDate < key &&
                            l.storage.toDate > key,
                        )?.storage;
                      return (
                        <td key={d}>
                          {nodes.map((n: Row) => (
                            <button
                              key={n.id}
                              onClick={() => openWorking(n.workingId)}
                            >
                              <strong>{n.working.diagram.number}</strong>
                              <br />
                              {n.working.startStation?.name || "?"} →{" "}
                              {n.working.finishStation?.name || "?"}
                            </button>
                          ))}
                          {!nodes.length &&
                            (storage
                              ? `Stabled · ${storage.stationName}`
                              : "No assignment")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {display(r)}
        </details>
      ))}
      {selected && (
        <Modal title="Approve rotation" onClose={() => setSelected(null)}>
          <p>
            Review every working and connection above. This approval creates or
            associates a permanent physical-set identity.
          </p>
          <SaveForm
            title="Save approved rotation"
            onSave={async (form) => {
              const v = formValues(form);
              await api(`/chains/${selected.id}/save`, "POST", {
                physicalSetId: v.physicalSetId || null,
                name: v.name,
                reason: v.reason,
                acknowledge: v.acknowledge === "on",
                locked: v.locked === "on",
              });
              await load();
              setSelected(null);
            }}
          >
            <Input label="Rotation name" name="name" required />
            <label>
              Physical set
              <select name="physicalSetId">
                <option value="">Create a new permanent physical set</option>
                {allSets.map((s: Row) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.label}
                  </option>
                ))}
              </select>
            </label>
            <Text label="Approval evidence / reason" name="reason" required />
            <label>
              <input type="checkbox" name="acknowledge" /> I accept the
              displayed uncertainties and open ends.
            </label>
            <label>
              <input type="checkbox" name="locked" defaultChecked /> Lock this
              approved research
            </label>
          </SaveForm>
        </Modal>
      )}
      {locking && (
        <Modal
          title={locking.locked ? "Unlock research" : "Lock research"}
          onClose={() => setLocking(null)}
        >
          <SaveForm
            title="Save lock status"
            onSave={async (form) => {
              await api(`/rotations/${locking.id}/lock`, "POST", {
                locked: !locking.locked,
                reason: formValues(form).reason,
              });
              await load();
              setLocking(null);
            }}
          >
            <Text label="Research reason" name="reason" required />
          </SaveForm>
        </Modal>
      )}
    </section>
  );
}
