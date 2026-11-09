import React, { useState } from "react";
import {
  Row,
  api,
  Input,
  Text,
  SaveForm,
  SearchSelect,
  DayPicker,
  dayLabel,
  days,
  timeLabel,
  parseTime,
  formValues,
  workingLabel,
  CatalogDialog,
} from "./common";
export function WorkingEditor({
  catalog,
  working,
  copy = false,
  copyDays,
  onSaved,
  onCancel,
  reload,
}: {
  catalog: Row;
  working?: Row | null;
  copy?: boolean;
  copyDays?: number[];
  onSaved: (w: Row) => Promise<void>;
  onCancel: () => void;
  reload: () => Promise<void>;
}) {
  const w = working;
  const edit = !!w?.id && !copy;
  const [diagramId, setDiagramId] = useState(w?.diagramId || ""),
    [startId, setStart] = useState(w?.startStationId || ""),
    [finishId, setFinish] = useState(w?.finishStationId || ""),
    [formationId, setFormation] = useState(w?.formationId || ""),
    [weekdays, setDays] = useState<number[]>(
      (copy ? copyDays : undefined) || w?.calendar?.weekdays || [],
    ),
    [calls, setCalls] = useState<Row[]>(
      (w?.routeCalls || []).map((c: Row) => ({ ...c })),
    ),
    [instructions, setInstructions] = useState<Row[]>(
      w?.instructions?.length
        ? w.instructions.map((i: Row) => ({ ...i }))
        : [{ text: "", weekdays: [] }],
    ),
    [exceptions, setExceptions] = useState<Row[]>(
      copy
        ? []
        : (w?.calendar?.exceptions || []).map((e: Row) => ({
            ...e,
            date: e.date.slice(0, 10),
          })),
    ),
    [dialog, setDialog] = useState<"start" | "finish" | null>(null),
    [exclusive, setExclusive] = useState(w?.exclusive ?? true);
  const stations = catalog.stations.map((s: Row) => ({
    id: s.id,
    label: `${s.name}${s.notes ? " · " + s.notes.slice(0, 35) : ""}`,
  }));
  return (
    <section className="panel editor">
      <div className="section-head">
        <div>
          <small>MANUAL ENTRY</small>
          <h2>
            {edit
              ? "Edit Daily Working"
              : copy
                ? "Copy Working to Multiple Days"
                : "Add Working"}
          </h2>
        </div>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <p>
        Enter the published working first. Physical-set identity and rotation
        calculations are not required.
      </p>
      {copy && (
        <p className="notice">
          This creates a new working definition. Continuation instructions and
          date exceptions are not copied.
        </p>
      )}
      <SaveForm
        title={edit ? "Save working changes" : "Save working"}
        onSave={async (f) => {
          const v = formValues(f),
            body = {
              diagramId,
              label: v.label,
              startStationId: startId || null,
              finishStationId: finishId || null,
              startMinutes: parseTime(String(v.startTime)),
              finishMinutes: parseTime(String(v.finishTime)),
              startDayOffset: Number(v.startDayOffset),
              finishDayOffset: Number(v.finishDayOffset),
              formationId: formationId || null,
              routeText: v.routeText,
              notes: v.notes,
              exclusive,
              calendar: {
                weekdays,
                cycleWeeks:Number(v.cycleWeeks||1),
              anchorDate:v.anchorDate||null,
              weekOffsets:String(v.weekOffsets||"1").split(",").map(x=>Number(x.trim())-1),
              validFrom: v.validFrom || null,
                validTo: v.validTo || null,
                notes: v.calendarNotes,
                exceptions: exceptions.map((e) => ({
                  date: e.date,
                  operates: e.operates,
                  notes: e.notes,
                })),
              },
              routeCalls: calls.map((c, i) => ({
                stationId: c.stationId,
                sequence: i + 1,
                notes: c.notes || "",
              })),
              instructions: instructions
                .filter((i) => i.text.trim())
                .map((i) => ({ text: i.text, weekdays: i.weekdays })),
              sources: edit
                ? []
                : v.sourceTitle
                  ? [
                      {
                        title: v.sourceTitle,
                        sourceDate: v.sourceDate || null,
                        page: v.sourcePage || null,
                        notes: v.sourceNotes,
                      },
                    ]
                  : [],
              ...(edit ? { revision: w.revision, reason: v.reason } : {}),
            };
          const saved = await api(
            "/workings" + (edit ? "/" + w.id : ""),
            edit ? "PUT" : "POST",
            body,
          );
          await onSaved(saved);
        }}
      >
        <div className="fields">
          <SearchSelect
            label="Published diagram"
            value={diagramId}
            onChange={setDiagramId}
            options={catalog.diagrams.map((d: Row) => ({
              id: d.id,
              label: `${d.number} · ${d.period.name}`,
            }))}
            required
            empty="Select a published diagram"
          />
          <Input
            label="Working label / variant"
            name="label"
            value={
              copy ? (w?.label || "Working") + " — copied variant" : w?.label
            }
            placeholder="For example: Monday–Friday or Saturday"
          />
        </div>
        {!catalog.diagrams.length && (
          <p className="warning">
            Add a historical period and published diagram in Published Diagrams
            first.
          </p>
        )}
        <DayPicker value={weekdays} onChange={setDays} />
        <div className="toolbar">
          <button type="button" onClick={() => setDays([0, 1, 2, 3, 4])}>
            Monday–Friday
          </button>
          <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
            Repeat Daily
          </button>
          <button type="button" onClick={() => setDays([5])}>
            Saturday only
          </button>
          <button type="button" onClick={() => setDays([6])}>
            Sunday only
          </button>
        </div>
        <div className="fields">
          <Input
            label="Valid from (optional)"
            name="validFrom"
            type="date"
            value={w?.calendar?.validFrom?.slice(0, 10)}
          />
          <Input
            label="Valid until (optional)"
            name="validTo"
            type="date"
            value={w?.calendar?.validTo?.slice(0, 10)}
          />
        </div>
        <details><summary>Alternate-week or multi-week operating calendar</summary><p>Use week 1 for ordinary weekly workings. For alternate weeks choose a two-week cycle, its first-week anchor date, and week 1 or 2.</p><div className="fields"><Input label="Calendar cycle length (weeks)" name="cycleWeeks" type="number" min={1} max={12} value={w?.calendar?.cycleWeeks||1}/><Input label="First-week anchor date" name="anchorDate" type="date" value={w?.calendar?.anchorDate?.slice(0,10)}/></div><Input label="Active cycle weeks (comma-separated, starting at 1)" name="weekOffsets" value={(w?.calendar?.weekOffsets||[0]).map((n:number)=>n+1).join(',')}/></details>
        <Text
          label="Operating calendar notes"
          name="calendarNotes"
          value={w?.calendar?.notes}
        />
        <div className="fields">
          <div>
            <SearchSelect
              label="Starting station"
              value={startId}
              onChange={setStart}
              options={stations}
            />
            <button type="button" onClick={() => setDialog("start")}>
              Add starting station
            </button>
          </div>
          <div>
            <SearchSelect
              label="Finishing station"
              value={finishId}
              onChange={setFinish}
              options={stations}
            />
            <button type="button" onClick={() => setDialog("finish")}>
              Add finishing station
            </button>
          </div>
        </div>
        <div className="fields four">
          <Input
            label="Starting time (HH:MM, optional)"
            name="startTime"
            value={w?.startMinutes == null ? "" : timeLabel(w.startMinutes)}
            placeholder="08:00"
          />
          <Input
            label="Start day offset"
            name="startDayOffset"
            type="number"
            min={0}
            max={14}
            value={w?.startDayOffset ?? 0}
          />
          <Input
            label="Finishing time (HH:MM, optional)"
            name="finishTime"
            value={w?.finishMinutes == null ? "" : timeLabel(w.finishMinutes)}
            placeholder="23:30"
          />
          <Input
            label="Finish day offset"
            name="finishDayOffset"
            type="number"
            min={0}
            max={14}
            value={w?.finishDayOffset ?? 0}
          />
        </div>
        <p className="muted">
          Day 0 is the operating date. A Sunday working finishing at 00:30 on
          Monday has finish day offset 1. Missing times remain unknown; Phase 1
          does not validate connections.
        </p>
        <Input
          label="Route description"
          name="routeText"
          value={w?.routeText}
          placeholder="For example: via Hull"
        />
        <details open={calls.length > 0}>
          <summary>Intermediate stations ({calls.length})</summary>
          {calls.map((c, i) => (
            <div className="route-row" key={i}>
              <SearchSelect
                label={"Intermediate station " + (i + 1)}
                value={c.stationId || ""}
                onChange={(v) =>
                  setCalls((a) =>
                    a.map((x, n) => (n === i ? { ...x, stationId: v } : x)),
                  )
                }
                options={stations}
                required
              />
              <button
                type="button"
                onClick={() => setCalls((a) => a.filter((_, n) => n !== i))}
              >
                Remove draft call
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setCalls((a) => [...a, { stationId: "", notes: "" }])
            }
          >
            Add intermediate station
          </button>
        </details>
        <SearchSelect
          label="Base carriage formation"
          value={formationId}
          onChange={setFormation}
          options={catalog.formations.map((f: Row) => ({
            id: f.id,
            label: `${f.name} · ${f.count.description}`,
          }))}
        />
        <p className="muted">
          Day-specific formation variations can be added after saving this
          working.
        </p>
        <h3>Special instructions</h3>
        {instructions.map((instruction, i) => (
          <div className="member" key={i}>
            <label>
              Instruction text
              <textarea
                aria-label={"Instruction text " + (i + 1)}
                value={instruction.text}
                onChange={(e) =>
                  setInstructions((a) =>
                    a.map((x, n) =>
                      n === i ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <DayPicker
              label={
                "Instruction " + (i + 1) + " days (empty = all operating days)"
              }
              value={instruction.weekdays}
              onChange={(v) =>
                setInstructions((a) =>
                  a.map((x, n) => (n === i ? { ...x, weekdays: v } : x)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setInstructions((a) => [...a, { text: "", weekdays: [] }])
          }
        >
          Add another instruction
        </button>
        <details open={exceptions.length > 0}>
          <summary>Date exceptions ({exceptions.length})</summary>
          {exceptions.map((e, i) => (
            <div className="member" key={i}>
              <label>
                Exception date
                <input
                  aria-label={"Exception date " + (i + 1)}
                  type="date"
                  required
                  value={e.date}
                  onChange={(v) =>
                    setExceptions((a) =>
                      a.map((x, n) =>
                        n === i ? { ...x, date: v.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={e.operates}
                  onChange={(v) =>
                    setExceptions((a) =>
                      a.map((x, n) =>
                        n === i ? { ...x, operates: v.target.checked } : x,
                      ),
                    )
                  }
                />
                Operates on this date
              </label>
              <label>
                Exception reason
                <input
                  aria-label={"Exception reason " + (i + 1)}
                  value={e.notes}
                  required
                  onChange={(v) =>
                    setExceptions((a) =>
                      a.map((x, n) =>
                        n === i ? { ...x, notes: v.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setExceptions((a) => a.filter((_, n) => n !== i))
                }
              >
                Remove draft exception
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setExceptions((a) => [
                ...a,
                { date: "", operates: false, notes: "" },
              ])
            }
          >
            Add date exception
          </button>
        </details>
        {!edit && (
          <>
            <h3>Manual source reference (optional)</h3>
            <div className="fields">
              <Input
                label="Source document title"
                name="sourceTitle"
                value={copy ? w?.sources[0]?.title : ""}
              />
              <Input
                label="Source document date"
                name="sourceDate"
                value={copy ? w?.sources[0]?.sourceDate : ""}
              />
              <Input
                label="Source page number"
                name="sourcePage"
                value={copy ? w?.sources[0]?.page : ""}
              />
              <Input
                label="Source reference notes"
                name="sourceNotes"
                value={copy ? w?.sources[0]?.notes : ""}
              />
            </div>
          </>
        )}
        <Text label="Working notes" name="notes" value={w?.notes} />
        <label className="check">
          <input
            type="checkbox"
            checked={exclusive}
            onChange={(e) => setExclusive(e.target.checked)}
          />
          Exclusive daily occurrence — only one physical set may be assigned
        </label>
        {edit && (
          <Input label="Reason for working edit" name="reason" required />
        )}
      </SaveForm>
      {dialog && (
        <CatalogDialog
          kind="stations"
          onClose={() => setDialog(null)}
          onCreated={async (row) => {
            await reload();
            if (dialog === "start") setStart(row.id);
            else setFinish(row.id);
          }}
        />
      )}
    </section>
  );
}
function Continuations({
  working: w,
  workings,
  onChanged,
  catalog,
}: {
  catalog:Row;
  working: Row;
  workings: Row[];
  onChanged: () => Promise<void>;
}) {
  const [scope, setScope] = useState<number[]>(w.calendar?.weekdays || []),
    [kind, setKind] = useState("UNKNOWN"),
    [number, setNumber] = useState(""),
    [target, setTarget] = useState(""),
    [mode, setMode] = useState("offset"),
    [offset, setOffset] = useState(1),
    [targetDay, setTargetDay] = useState(0),
    [targetDate, setTargetDate] = useState("");
  const [storage,setStorage]=useState(""),[verified,setVerified]=useState(false);
  const candidates = workings.filter(
    (t) =>
      !number || t.diagram.number.toLowerCase() === number.trim().toLowerCase(),
  );
  return (
    <section className="panel">
      <h2>Next working / diagram</h2>
      <p>
        Instructions are recorded evidence, not a verified connection. Select
        the specific daily working when numbers are ambiguous.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>From day</th>
              <th>Entered instruction</th>
              <th>Target</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {w.nextRules.map((r: Row) => (
              <tr key={r.id}>
                <td>{days[r.weekday]}</td>
                <td>
                  {r.kind === "TARGET"
                    ? r.enteredNumber || "Selected working"
                    : r.kind}
                </td>
                <td>
                  {r.targetWorking
                    ? workingLabel(r.targetWorking)
                    : r.kind === "TARGET"
                      ? "Unresolved reference"
                      : "—"}
                </td>
                <td>
                  {r.targetDate
                    ? r.targetDate.slice(0, 10)
                    : r.targetWeekday != null
                      ? "Next " + days[r.targetWeekday]
                      : r.offsetDays != null
                        ? "+" + r.offsetDays + " day(s)"
                        : "Unknown"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SaveForm
        title="Save next-working instructions"
        onSave={async (f) => {
          if (!scope.length)
            throw new Error("Select at least one source weekday.");
          if (kind === "TARGET" && !target && !number.trim())
            throw new Error(
              "Choose a working or enter an unresolved published number.",
            );
          await api("/workings/" + w.id + "/next", "PUT", {
            reason: new FormData(f).get("reason"),
            rules: scope.map((weekday) => ({
              weekday,
              kind,
              targetWorkingId: ["TARGET","STABLED"].includes(kind) ? target || null : null,
              enteredNumber:
                ["TARGET","STABLED"].includes(kind)
                  ? number ||
                    workings.find((x) => x.id === target)?.diagram.number ||
                    null
                  : null,
              offsetDays:
                kind !== "UNKNOWN" && kind !== "END" && mode === "offset"
                  ? offset
                  : null,
              targetWeekday:
                kind !== "UNKNOWN" && kind !== "END" && mode === "weekday"
                  ? targetDay
                  : null,
              targetDate:
                kind !== "UNKNOWN" && kind !== "END" && mode === "date"
                  ? targetDate || null
                  : null,
              storageStationId:kind==="STABLED"?storage||null:null,
              verified,
              notes: String(new FormData(f).get("notes") || ""),
            })),
          });
          await onChanged();
        }}
      >
        <DayPicker
          label="Source days for this instruction"
          value={scope}
          onChange={setScope}
        />
        <label>
          Instruction kind
          <select
            aria-label="Next instruction kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="UNKNOWN">Unknown next working</option>
            <option value="TARGET">Selected next working / diagram</option>
            <option value="STABLED">No working / stabled</option>
            <option value="END">No further working recorded</option>
          </select>
        </label>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => {
              setKind("TARGET");
              setNumber(w.diagram.number);
              setTarget("");
              setMode("offset");
              setOffset(1);
            }}
          >
            Same Diagram Next Day
          </button>
          <button
            type="button"
            onClick={() => {
              setKind("TARGET");
              setNumber("");
              setTarget("");
              setMode("offset");
              setOffset(1);
            }}
          >
            Different Diagram Next Day
          </button>
        </div>
        {["TARGET","STABLED"].includes(kind) && (
          <>
            <label>
              Published number to find
              <input
                aria-label="Find next published number"
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setTarget("");
                }}
              />
            </label>
            <SearchSelect
              label="Specific next daily working"
              value={target}
              onChange={setTarget}
              options={candidates.map((t) => ({
                id: t.id,
                label: workingLabel(t),
              }))}
              empty="Leave unresolved, or select the intended working"
            />
            <p className="muted">
              {candidates.length} alternative(s). A matching number never
              selects a working automatically. Historical periods and weekday
              variants are shown in the choices.
            </p>
          </>
        )}
        {kind !== "UNKNOWN" && kind !== "END" && (
          <>
            <label>
              Continuation date rule
              <select
                aria-label="Continuation date rule"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="offset">After a number of days</option>
                <option value="weekday">On a particular next weekday</option>
                <option value="date">On an explicit date</option>
                {kind === "STABLED" && (
                  <option value="unknown">Duration unknown</option>
                )}
              </select>
            </label>
            {mode === "offset" && (
              <label>
                Day offset (0 = same day)
                <input
                  aria-label="Continuation day offset"
                  type="number"
                  min={0}
                  max={366}
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                />
              </label>
            )}
            {mode === "weekday" && (
              <label>
                Target weekday
                <select
                  aria-label="Target weekday"
                  value={targetDay}
                  onChange={(e) => setTargetDay(Number(e.target.value))}
                >
                  {days.map((d, n) => (
                    <option key={n} value={n}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {mode === "date" && (
              <label>
                Specific target date
                <input
                  aria-label="Specific target date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  required
                />
              </label>
            )}
          </>
        )}
        {kind==='STABLED'&&<><SearchSelect label="Stabling location" value={storage} onChange={setStorage} options={catalog.stations.map((s:Row)=>({id:s.id,label:s.name}))}/><button type="button" onClick={()=>setStorage(w.finishStationId||'')}>Use this day's finishing station for storage</button><p className="muted">Leave the storage location unknown if it is not established. Select a resuming working above to continue the chain after storage.</p></>}
        <label className="check"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>I checked this continuation against the entered source citation</label>
        <Text label="Continuation source instruction / notes" name="notes" />
        <Input label="Reason for continuation change" name="reason" required />
      </SaveForm>
    </section>
  );
}
export function WorkingDetail({
  working: w,
  workings,
  catalog,
  onEdit,
  onCopy,
  onChanged,
  onBack,
}: {
  working: Row;
  workings: Row[];
  catalog: Row;
  onEdit: () => void;
  onCopy: (days?: number[]) => void;
  onChanged: () => Promise<void>;
  onBack: () => void;
}) {
  const [variationDay, setVariationDay] = useState(0),
    [variationFormation, setVariationFormation] = useState(""),
    [changeDays, setChangeDays] = useState<number[]>([]),
    [changeType, setChangeType] = useState("");
  return (
    <>
      <div className="toolbar">
        <button onClick={onBack}>← All workings</button>
        <button className="primary" onClick={onEdit}>
          Edit Daily Working
        </button>
        <button onClick={() => onCopy()}>Copy Working to Multiple Days</button>
        <button onClick={() => onCopy([5])}>Copy as Saturday variant</button>
        <button onClick={() => onCopy([6])}>Copy as Sunday variant</button>
      </div>
      <section className="panel">
        <div className="section-head">
          <div>
            <small>{w.diagram.period.name}</small>
            <h2>
              Diagram {w.diagram.number} ·{" "}
              {w.label || dayLabel(w.calendar?.weekdays || [])}
            </h2>
          </div>
          <span className="badge">Manual entry · not continuity-checked</span>
        </div>
        <div className="journey">
          <div>
            <small>STARTS</small>
            <h3>{w.startStation?.name || "Unknown station"}</h3>
            <p>{timeLabel(w.startMinutes, w.startDayOffset)}</p>
          </div>
          <span>→</span>
          <div>
            <small>FINISHES</small>
            <h3>{w.finishStation?.name || "Unknown station"}</h3>
            <p>{timeLabel(w.finishMinutes, w.finishDayOffset)}</p>
          </div>
        </div>
        <p>Operating days: {dayLabel(w.calendar?.weekdays || [])}</p>
        <p>
          Route:{" "}
          {w.routeText ||
            w.routeCalls.map((c: Row) => c.station.name).join(" → ") ||
            "Not entered"}
        </p>
        <p>Formation: {w.formation?.name || "Unknown"}</p>
        {w.instructions.map((i: Row) => (
          <p key={i.id}>
            <strong>{i.text}</strong> ·{" "}
            {i.weekdays.length ? dayLabel(i.weekdays) : "All operating days"}
          </p>
        ))}
        <p>{w.notes}</p>
        <small>
          Revision {w.revision}
        </small>
      </section>
      <div className="two-columns">
        <Continuations
          key={w.id}
          working={w}
          workings={workings}
          catalog={catalog}
          onChanged={onChanged}
        />
        <section className="panel">
          <h2>Sources and research</h2>
          {w.sources.map((s: Row) => (
            <article key={s.id}>
              <h3>{s.title}</h3>
              <p>
                {s.sourceDate || "Date not entered"} · page{" "}
                {s.page || "not entered"}
              </p>
              <p>{s.notes}</p>
            </article>
          ))}
          <details>
            <summary>Add source reference</summary>
            <SaveForm
              title="Add source citation"
              onSave={async (f) => {
                await api(
                  "/workings/" + w.id + "/sources",
                  "POST",
                  formValues(f),
                );
                await onChanged();
              }}
            >
              <Input label="Source title" name="title" required />
              <Input label="Source date" name="sourceDate" />
              <Input label="Printed page" name="page" />
              <Text label="Citation notes" name="notes" />
            </SaveForm>
          </details>
          <SaveForm
            title="Add research note"
            onSave={async (f) => {
              await api("/workings/" + w.id + "/notes", "POST", formValues(f));
              f.reset();
              await onChanged();
            }}
          >
            <Text label="Research note" name="text" required />
          </SaveForm>
          {w.researchNotes.map((n: Row) => (
            <article key={n.id}>
              <p>{n.text}</p>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </section>
      </div>
      <div className="two-columns">
        <section className="panel">
          <h2>Day-specific formation variations</h2>
          {w.variations.map((v: Row) => (
            <p key={v.id}>
              {days[v.weekday]}: {v.formation?.name || "Explicitly unknown"} ·{" "}
              {v.notes}
            </p>
          ))}
          <SaveForm
            title="Save formation variation"
            onSave={async (f) => {
              await api("/workings/" + w.id + "/variations", "PUT", {
                weekday: variationDay,
                formationId: variationFormation || null,
                notes: new FormData(f).get("notes"),
              });
              await onChanged();
            }}
          >
            <label>
              Variation weekday
              <select
                aria-label="Variation weekday"
                value={variationDay}
                onChange={(e) => setVariationDay(Number(e.target.value))}
              >
                {days.map((d, n) => (
                  <option key={n} value={n}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <SearchSelect
              label="Variation formation"
              value={variationFormation}
              onChange={setVariationFormation}
              options={catalog.formations.map((f: Row) => ({
                id: f.id,
                label: f.name,
              }))}
            />
            <Text label="Variation source / reason" name="notes" required />
          </SaveForm>
        </section>
        <section className="panel">
          <h2>Attachments and detachments</h2>
          {w.changes.map((c: Row) => (
            <p key={c.id}>
              {c.action} {c.quantity ?? "?"} × {c.type?.name || "unknown type"}{" "}
              · {c.stage} ·{" "}
              {c.weekdays.length ? dayLabel(c.weekdays) : "All operating days"}{" "}
              · {c.notes}
            </p>
          ))}
          <SaveForm
            title="Record formation change"
            onSave={async (f) => {
              const v = formValues(f);
              await api("/workings/" + w.id + "/changes", "POST", {
                weekdays: changeDays,
                action: v.action,
                stage: v.stage,
                typeId: changeType || null,
                quantity: v.quantity ? Number(v.quantity) : null,
                notes: v.notes,
              });
              await onChanged();
            }}
          >
            <DayPicker
              label="Change days (empty = all operating days)"
              value={changeDays}
              onChange={setChangeDays}
            />
            <div className="fields">
              <label>
                Action
                <select name="action">
                  <option>Attach</option>
                  <option>Detach</option>
                </select>
              </label>
              <label>
                Stage
                <select name="stage">
                  <option>Start</option>
                  <option>En route</option>
                  <option>Finish</option>
                </select>
              </label>
            </div>
            <SearchSelect
              label="Changed carriage type"
              value={changeType}
              onChange={setChangeType}
              options={catalog.types.map((t: Row) => ({
                id: t.id,
                label: t.name,
              }))}
            />
            <Input
              label="Changed quantity (unknown = blank)"
              name="quantity"
              type="number"
              min={1}
            />
            <Text label="Change source / explanation" name="notes" required />
          </SaveForm>
          <p className="muted">
            Changes are recorded only. Formation compatibility checks belong to
            Phase 2.
          </p>
        </section>
      </div>
    </>
  );
}
