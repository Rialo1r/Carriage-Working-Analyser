import { RotationPlans } from "./Rotations";
import React, { useEffect, useState } from "react";
import {
  api,
  Row,
  SaveForm,
  Input,
  Text,
  Modal,
  SearchSelect,
  timeLabel,
  formValues,
} from "./common";
const label = (o: Row) =>
  o
    ? `${o.date.slice(0, 10)} · Set ${o.working.diagram.number} · ${o.working.startStation?.name || "?"} → ${o.working.finishStation?.name || "?"}`
    : "Unknown working";
export function IssueDesk({ catalog, openWorking }: any) {
  const [rows, setRows] = useState<Row[]>([]),
    [filters, setFilters] = useState<Row>({}),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [history, setHistory] = useState<Row[]>([]);
  async function refresh() {
    setRows(
      await api(
        "/issues?" +
          new URLSearchParams(
            Object.entries(filters).filter(([, v]) => v) as any,
          ),
      ),
    );
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [JSON.stringify(filters)]);
  return (
    <>
      <p>
        Findings remain in the research record. Dismissed findings are not
        automatically resolved. Re-run connection checking after editing the
        roster.
      </p>
      <div className="toolbar">
        {[
          ["severity", ["Error", "Warning", "Unresolved", "Verified"]],
          ["reviewState", ["Open", "Investigated", "Resolved", "Dismissed"]],
        ].map(([key, values]: any) => (
          <label key={key}>
            {key === "severity" ? "Severity" : "Research state"}
            <select
              value={filters[key] || ""}
              onChange={(e) =>
                setFilters({ ...filters, [key]: e.target.value })
              }
            >
              <option value="">All</option>
              {values.map((v: string) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        {[
          ["stationId", "Station", catalog.stations],
          ["diagramId", "Diagram", catalog.diagrams],
          ["physicalSetId", "Physical set", catalog.sets],
        ].map(([key, title, items]: any) => (
          <label key={key}>
            {title}
            <select
              value={filters[key] || ""}
              onChange={(e) =>
                setFilters({ ...filters, [key]: e.target.value })
              }
            >
              <option value="">All</option>
              {items.map((x: Row) => (
                <option key={x.id} value={x.id}>
                  {x.name || x.number || x.code}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            onChange={(e) =>
              setFilters({
                ...filters,
                includeInactive: e.target.checked ? "true" : "",
              })
            }
          />{" "}
          Include past findings
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p className="empty">
          No findings for these filters. Check all connections from Stock Chains
          to analyse the entered roster.
        </p>
      )}
      {rows.map((i) => (
        <article className="panel" key={i.id}>
          <span className="badge">
            {i.severity} · {i.reviewState}
            {!i.active ? " · Not currently detected" : ""}
          </span>
          <h3>{i.description}</h3>
          {[i.from, i.to].filter(Boolean).map((o) => (
            <p key={o.id}>
              <button onClick={() => openWorking(o.workingId)}>
                {label(o)}
              </button>
              {o.working.sources?.map((s: Row) => (
                <small key={s.id}>
                  {" "}
                  {s.title} · p. {s.page}
                </small>
              ))}
            </p>
          ))}
          <p>{i.reason}</p>
          <p>
            <strong>Next action:</strong> {i.action}
          </p>
          <button
            onClick={() => {
              setSelected(i);
              void api(`/issues/${i.id}/history`).then(setHistory);
            }}
          >
            Research notes & status
          </button>
        </article>
      ))}
      {selected && (
        <Modal title="Investigate finding" onClose={() => setSelected(null)}>
          <p>{selected.description}</p>
          <details>
            <summary>Original finding</summary>
            <p>{selected.originalFinding.description}</p>
            <p>{selected.originalFinding.reason}</p>
          </details>
          <SaveForm
            onSave={async (form) => {
              const v = formValues(form);
              await api(`/issues/${selected.id}/review`, "POST", {
                state: v.state,
                note: v.note,
              });
              await refresh();
              setSelected(null);
            }}
            title="Save research review"
          >
            <label>
              Research state
              <select name="state" defaultValue={selected.reviewState}>
                {["Open", "Investigated", "Resolved", "Dismissed"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <Text label="Research note" name="note" required />
          </SaveForm>
          {history.map((h) => (
            <p key={h.id}>
              {h.state} · {h.note}
            </p>
          ))}
        </Modal>
      )}
    </>
  );
}
export function ChainDesk({ catalog, openWorking }: any) {
  const [run, setRun] = useState<Row | null>(null),
    [period, setPeriod] = useState(catalog.periods[0]?.id || ""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [movement, setMovement] = useState<Row | null>(null),
    [query, setQuery] = useState(""),
    [runs, setRuns] = useState<Row[]>([]),
    [manual, setManual] = useState(false),
    [workings, setWorkings] = useState<Row[]>([]);
  useEffect(() => {
    void Promise.all([api("/analysis"), api("/workings")])
      .then(([r, w]) => {
        setRuns(r);
        setWorkings(w);
        if (r[0]) void api("/analysis/" + r[0].id).then(setRun);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function reload() {
    if (run) setRun(await api("/analysis/" + run.id));
  }
  return (
    <>
      <p>
        Check at least two weeks. Matching stations suggest a possibility; only
        your research approval establishes a connection.
      </p>
      <label>
        Previous analysis
        <select
          value={run?.id || ""}
          onChange={(e) =>
            void api("/analysis/" + e.target.value)
              .then(setRun)
              .catch((e) => setError(e.message))
          }
        >
          <option value="">Choose an analysis</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {catalog.periods.find((p: Row) => p.id === r.periodId)?.name ||
                "Historical period"}{" "}
              · {r.startDate.slice(0, 10)} — {r.endDate.slice(0, 10)}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => setManual(true)}>
        Manually connect two daily workings
      </button>
      <SaveForm
        title="Check All Connections"
        onSave={async (form) => {
          const v = formValues(form);
          const r = await api("/analysis", "POST", {
            periodId: period,
            start: v.start,
            weeks: Number(v.weeks),
          });
          setRun(await api("/analysis/" + r.id));
          setRuns(await api("/analysis"));
        }}
      >
        <SearchSelect
          label="Historical period"
          value={period}
          onChange={setPeriod}
          options={catalog.periods.map((p: Row) => ({
            id: p.id,
            label: p.name,
          }))}
        />
        <Input
          label="First date"
          name="start"
          type="date"
          value="1939-01-02"
          required
        />
        <Input
          label="Weeks to analyse"
          name="weeks"
          type="number"
          value="8"
          min="2"
          max="26"
          required
        />
      </SaveForm>
      {error && <p role="alert">{error}</p>}
      {run && (
        <>
          <h2>Connection review</h2>
          {run.stale && (
            <p className="error">
              The roster has changed. Re-run checking before generating
              rotations.
            </p>
          )}
          <p>
            {run.startDate.slice(0, 10)} to {run.endDate.slice(0, 10)} ·{" "}
            {run.issues.filter((i: Row) => i.active).length} findings
          </p>
          <input
            aria-label="Filter connections"
            placeholder="Filter by diagram number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {run.proposals
            .filter(
              (p: Row) =>
                !query ||
                [
                  p.from.working.diagram.number,
                  p.to.working.diagram.number,
                ].some((n: string) =>
                  n.toLowerCase().includes(query.toLowerCase()),
                ),
            )
            .map((p: Row) => (
              <article className="panel" key={p.id}>
                <span className="badge">
                  {p.approved
                    ? "Approved by research"
                    : p.review?.decision === "Rejected"
                      ? "Rejected"
                      : p.classification}
                </span>
                <h3>
                  <button onClick={() => openWorking(p.from.workingId)}>
                    {label(p.from)}
                  </button>
                </h3>
                <p>
                  ↓{" "}
                  {p.kind === "CANDIDATE"
                    ? "Suggested continuation"
                    : "Entered continuation"}
                </p>
                <button onClick={() => openWorking(p.to.workingId)}>
                  {label(p.to)}
                </button>
                {p.storage && (
                  <p>
                    Stabled: {p.storage.stationName} · {p.storage.basis}
                  </p>
                )}
                <details>
                  <summary>Why this connection was flagged</summary>
                  {p.checks.map((c: Row) => (
                    <p key={c.code}>
                      <strong>
                        {c.state} · {c.name}:
                      </strong>{" "}
                      {c.reason}
                    </p>
                  ))}
                </details>
                <button onClick={() => setSelected(p)}>
                  Approve / reject / disconnect
                </button>
                <button onClick={() => setMovement(p)}>
                  Record connecting movement
                </button>
              </article>
            ))}
          {!run.proposals.length && (
            <p>
              No connection candidates found. Add exact next-working
              instructions or further workings.
            </p>
          )}
        </>
      )}
      {manual && (
        <Modal
          title="Connect specific dated workings"
          onClose={() => setManual(false)}
        >
          <SaveForm
            title="Approve manual connection"
            onSave={async (form) => {
              const v = formValues(form);
              await api("/connections/manual", "POST", {
                fromWorkingId: v.fromWorkingId,
                toWorkingId: v.toWorkingId,
                fromDate: v.fromDate,
                toDate: v.toDate,
                reason: v.reason,
                acknowledge: v.acknowledge === "on",
              });
              setManual(false);
              await reload();
            }}
          >
            {["from", "to"].map((k) => (
              <React.Fragment key={k}>
                <label>
                  {k} daily working
                  <select name={k + "WorkingId"} required>
                    <option value="">Select a specific working</option>
                    {workings.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.diagram.number} · {w.label} ·{" "}
                        {w.startStation?.name || "?"} →{" "}
                        {w.finishStation?.name || "?"}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label={k + " date"}
                  name={k + "Date"}
                  type="date"
                  required
                />
              </React.Fragment>
            ))}
            <Text label="Research reason" name="reason" required />
            <label>
              <input type="checkbox" name="acknowledge" /> I accept
              compatibility that remains unverified due to missing information.
            </label>
          </SaveForm>
        </Modal>
      )}
      <RotationPlans run={run} catalog={catalog} openWorking={openWorking} />
      {selected && (
        <Modal title="Review connection" onClose={() => setSelected(null)}>
          <p>
            {label(selected.from)} → {label(selected.to)}
          </p>
          <SaveForm
            title="Save decision"
            onSave={async (form) => {
              const v = formValues(form);
              await api(`/proposals/${selected.id}/review`, "POST", {
                decision: v.decision,
                reason: v.reason,
                acknowledge: v.acknowledge === "on",
              });
              await reload();
              setSelected(null);
            }}
          >
            <label>
              Decision
              <select name="decision">
                <option>Approved</option>
                <option>Rejected</option>
                <option>Pending</option>
              </select>
            </label>
            <Text label="Research reason" name="reason" required />
            <label>
              <input type="checkbox" name="acknowledge" /> I have reviewed and
              accept the displayed uncertainties.
            </label>
          </SaveForm>
        </Modal>
      )}
      {movement && (
        <Modal
          title="Record an additional movement"
          onClose={() => setMovement(null)}
        >
          <p>
            Enter an evidenced movement. It will be checked after re-running the
            analysis.
          </p>
          <SaveForm
            title="Record movement"
            onSave={async (form) => {
              const v = formValues(form);
              await api("/transfers", "POST", {
                fromId: movement.fromId,
                toId: movement.toId,
                sequence: Number(v.sequence),
                startStationId: v.startStationId || null,
                finishStationId: v.finishStationId || null,
                startDate: v.startDate,
                finishDate: v.finishDate,
                startMinutes: v.startMinutes
                  ? Number(String(v.startMinutes).split(":")[0]) * 60 +
                    Number(String(v.startMinutes).split(":")[1])
                  : null,
                finishMinutes: v.finishMinutes
                  ? Number(String(v.finishMinutes).split(":")[0]) * 60 +
                    Number(String(v.finishMinutes).split(":")[1])
                  : null,
                sourceTitle: v.sourceTitle,
                sourcePage: v.sourcePage,
                notes: v.notes,
              });
              setMovement(null);
            }}
          >
            <Input
              label="Movement order"
              name="sequence"
              type="number"
              value="1"
              required
            />
            {["start", "finish"].map((k) => (
              <React.Fragment key={k}>
                <label>
                  {k} station
                  <select
                    name={k + "StationId"}
                    defaultValue={
                      k === "start"
                        ? movement.from.working.finishStationId || ""
                        : movement.to.working.startStationId || ""
                    }
                  >
                    <option value="">Unknown</option>
                    {catalog.stations.map((s: Row) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label={k + " date"}
                  name={k + "Date"}
                  type="date"
                  value={(k === "start"
                    ? movement.from.date
                    : movement.to.date
                  ).slice(0, 10)}
                  required
                />
                <Input label={k + " time"} name={k + "Minutes"} type="time" />
              </React.Fragment>
            ))}
            <Input label="Source" name="sourceTitle" />
            <Input label="Page" name="sourcePage" />
            <Text label="Movement evidence / notes" name="notes" required />
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
