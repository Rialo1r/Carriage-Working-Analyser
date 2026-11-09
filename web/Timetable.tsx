import React, { useState } from "react";
import {
  api,
  Row,
  days,
  dateLabel,
  timeLabel,
  SearchSelect,
  SaveForm,
  Text,
} from "./common";
function monday() {
  const d = new Date();
  const key = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  key.setUTCDate(key.getUTCDate() - ((key.getUTCDay() + 6) % 7));
  return key.toISOString().slice(0, 10);
}
export function Timetable({ onOpen }: { onOpen: (id: string) => void }) {
  const [start, setStart] = useState(monday()),
    [weeks, setWeeks] = useState(1),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [occurrenceId, setOccurrence] = useState(""),
    [setId, setSet] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      await api("/timetable/materialize", "POST", { start, weeks });
      setData(await api("/timetable?start=" + start + "&weeks=" + weeks));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function cell(o: Row) {
    return (
      <div className="working-cell" key={o.id}>
        <button className="cell-link" onClick={() => onOpen(o.workingId)}>
          Diagram {o.working.diagram.number}
        </button>
        <p>
          {o.working.startStation?.name || "?"} →{" "}
          {o.working.finishStation?.name || "?"}
        </p>
        <small>
          {timeLabel(o.working.startMinutes, o.working.startDayOffset)} –{" "}
          {timeLabel(o.working.finishMinutes, o.working.finishDayOffset)}
        </small>
        <p>
          {o.working.routeText ||
            o.working.routeCalls.map((c: Row) => c.station.name).join(" → ") ||
            "Route not entered"}
        </p>
        {o.instructions.map((i: Row) => (
          <p className="instruction" key={i.id}>
            {i.text}
          </p>
        ))}
        <small>
          {o.formation?.name || "Unknown formation"} ·{" "}
          {o.formationCount.description}
        </small>
        <p className="unverified">Unverified</p>
        {!o.onCalendar && (
          <p className="warning">
            Outside current calendar — manual assignment retained.
          </p>
        )}
        {o.assignments.some((a: Row) => a.workingRevised) && (
          <p className="muted">Working revised since assignment.</p>
        )}
      </div>
    );
  }
  return (
    <>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Basic weekly timetable</h2>
            <p>
              Generated from entered calendars and manual assignments. These are
              separate dated occurrences, not automatically generated rotations.
            </p>
          </div>
          <span className="badge">Phase 1 · all connections unverified</span>
        </div>
        <div className="toolbar">
          <label>
            First displayed date
            <input
              aria-label="Timetable first date"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            Weeks
            <select
              aria-label="Timetable weeks"
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={loading || !start}
            onClick={() => void load()}
          >
            {loading ? "Loading…" : "Build weekly timetable"}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {data && (
        <>
          <section className="panel board-panel">
            <h2>Physical-set timetable</h2>
            {!data.physicalSets.length && (
              <p className="empty">
                Add a physical set to make manual assignments. All working entry
                can be completed without one.
              </p>
            )}
            <div className="table-wrap">
              <table className="board">
                <thead>
                  <tr>
                    <th>Physical set</th>
                    {data.dates.map((date: string) => (
                      <th key={date}>
                        {days[(new Date(date).getUTCDay() + 6) % 7]}
                        <small>{dateLabel(date)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.physicalSets.map((s: Row) => (
                    <tr key={s.id}>
                      <th>
                        {s.code}
                        <small>{s.label}</small>
                      </th>
                      {data.dates.map((date: string) => (
                        <td key={date}>
                          {data.occurrences
                            .filter(
                              (o: Row) =>
                                o.date.slice(0, 10) === date &&
                                o.assignments.some(
                                  (a: Row) => a.physicalSetId === s.id,
                                ),
                            )
                            .map(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="two-columns">
            <section className="panel">
              <h2>Assign a dated working manually</h2>
              <SaveForm
                title="Assign physical set"
                onSave={async (f) => {
                  await api("/assignments", "POST", {
                    occurrenceId,
                    physicalSetId: setId,
                    notes: new FormData(f).get("notes"),
                  });
                  await load();
                }}
              >
                <SearchSelect
                  label="Dated daily working"
                  value={occurrenceId}
                  onChange={setOccurrence}
                  options={data.occurrences
                    .filter((o: Row) => o.onCalendar)
                    .map((o: Row) => ({
                      id: o.id,
                      label: `${o.date.slice(0, 10)} · Diagram ${o.working.diagram.number} · ${o.working.label || o.workingId.slice(0, 6)} · ${o.working.startStation?.name || "?"} → ${o.working.finishStation?.name || "?"}`,
                    }))}
                  required
                />
                <SearchSelect
                  label="Physical set for assignment"
                  value={setId}
                  onChange={setSet}
                  options={data.physicalSets.map((s: Row) => ({
                    id: s.id,
                    label: s.code + (s.label ? " · " + s.label : ""),
                  }))}
                  required
                />
                <Text
                  label="Assignment evidence / notes"
                  name="notes"
                  required
                />
              </SaveForm>
            </section>
            <section className="panel">
              <h2>Entered next-working references</h2>
              <p>
                Location, timing and formation continuity have not been checked.
                Automatic checks begin in Phase 2.
              </p>
              {data.occurrences.map((o: Row) => (
                <article key={o.id}>
                  <button className="link" onClick={() => onOpen(o.workingId)}>
                    {o.date.slice(0, 10)} · Diagram {o.working.diagram.number}
                  </button>
                  <p>
                    {o.outgoing?.to
                      ? `${o.outgoing.to.date.slice(0, 10)} · Diagram ${o.outgoing.to.working.diagram.number} · target occurrence ${o.outgoing.to.id.slice(0, 8)}`
                      : o.outgoing?.kind || "Unknown next working"}
                  </p>
                  <small>{o.outgoing?.note || "No entered instruction"}</small>
                </article>
              ))}
            </section>
          </div>
          <section className="panel">
            <h2>All dated workings</h2>
            {!data.occurrences.length && (
              <p className="empty">
                No working definitions operate in this date range. Check the
                historical period and calendar you entered.
              </p>
            )}
            {data.occurrences.map((o: Row) => (
              <article key={o.id}>
                <div className="section-head">
                  <button className="link" onClick={() => onOpen(o.workingId)}>
                    {o.date.slice(0, 10)} · Diagram {o.working.diagram.number} ·{" "}
                    {o.working.label}
                  </button>
                  <small>Occurrence {o.id}</small>
                </div>
                <p>
                  {o.assignments.length
                    ? o.assignments
                        .map((a: Row) => a.physicalSet.code)
                        .join(", ")
                    : "No physical set assigned"}
                </p>
                {o.assignments.map((a: Row) => (
                  <details key={a.id}>
                    <summary>Unassign {a.physicalSet.code}</summary>
                    <SaveForm
                      title="Remove manual assignment"
                      onSave={async (f) => {
                        await api("/assignments/" + a.id, "DELETE", {
                          reason: new FormData(f).get("reason"),
                        });
                        await load();
                      }}
                    >
                      <Text
                        label="Reason for unassigning"
                        name="reason"
                        required
                      />
                    </SaveForm>
                  </details>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
