import { RecordActions } from "./Management";
import React, { useState } from "react";
import {
  Row,
  api,
  Input,
  Text,
  SaveForm,
  SearchSelect,
  formValues,
  CatalogDialog,
} from "./common";
export function DiagramPage({
  catalog,
  reload,
}: {
  catalog: Row;
  reload: () => Promise<void>;
}) {
  const [period, setPeriod] = useState(""),
    [edit, setEdit] = useState<Row | null>(null);
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>{edit ? "Edit Published Diagram" : "Add Published Diagram"}</h2>
        <SaveForm
          key={edit?.id || "new"}
          title={edit ? "Save diagram changes" : "Add diagram"}
          onSave={async (f) => {
            const v = formValues(f);
            await api(
              "/diagrams" + (edit ? "/" + edit.id : ""),
              edit ? "PUT" : "POST",
              {
                number: v.number,
                description: v.description,
                periodId: period,
                ...(edit ? { revision: edit.revision, reason: v.reason } : {}),
              },
            );
            setEdit(null);
            await reload();
          }}
        >
          <Input
            label="Published diagram / set number"
            name="number"
            value={edit?.number}
            required
          />
          <SearchSelect
            label="Historical period"
            value={period}
            onChange={setPeriod}
            options={catalog.periods.map((p: Row) => ({
              id: p.id,
              label: p.name,
            }))}
            required
            empty="Choose or add a historical period"
          />
          <Text
            label="Diagram description"
            name="description"
            value={edit?.description}
          />
          {edit && (
            <Input label="Reason for diagram edit" name="reason" required />
          )}
        </SaveForm>
        {edit && <button onClick={() => setEdit(null)}>Cancel edit</button>}
        <details open={!catalog.periods.length}>
          <summary>Add a historical period</summary>
          <SaveForm
            title="Add period"
            onSave={async (f) => {
              const v = formValues(f);
              const p = await api("/periods", "POST", {
                ...v,
                startDate: v.startDate || null,
                endDate: v.endDate || null,
              });
              setPeriod(p.id);
              await reload();
            }}
          >
            <Input
              label="Period name"
              name="name"
              placeholder="For example: LNER North Eastern Area, 1939"
              required
            />
            <div className="fields">
              <Input
                label="Period begins (optional)"
                name="startDate"
                type="date"
              />
              <Input
                label="Period ends (optional)"
                name="endDate"
                type="date"
              />
            </div>
            <Text label="Period notes" name="notes" />
          </SaveForm>
        </details>
      </section>
      <section className="panel">
        <h2>Published diagrams</h2>
        <p className="muted">
          Numbers are source data. The same number can exist in another period
          or as another separately identified record.
        </p>
        {!catalog.diagrams.length && (
          <p className="empty">No published diagrams yet.</p>
        )}
        {catalog.diagrams.map((d: Row) => (
          <article key={d.id}>
            <h3>{d.number}</h3>
            <p>{d.period.name}</p>
            <p>{d.description}</p>
            <RecordActions
              kind="diagrams"
              row={d}
              catalog={catalog}
              onChanged={reload}
            />
            <button
              onClick={() => {
                setEdit(d);
                setPeriod(d.periodId);
              }}
            >
              Edit diagram
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
export function PhysicalSets({
  catalog,
  reload,
}: {
  catalog: Row;
  reload: () => Promise<void>;
}) {
  const [edit, setEdit] = useState<Row | null>(null);
  return (
    <div className="two-columns">
      <section className="panel">
        <h2>{edit ? "Edit " + edit.code : "Add Physical Set"}</h2>
        <p>
          Identifiers are generated permanently. Entering a published diagram
          does not create a physical set.
        </p>
        <SaveForm
          key={edit?.id || "new"}
          title={edit ? "Save physical set changes" : "Create physical set"}
          onSave={async (f) => {
            await api(
              "/physical-sets" + (edit ? "/" + edit.id : ""),
              edit ? "PUT" : "POST",
              formValues(f),
            );
            setEdit(null);
            await reload();
          }}
        >
          <Input
            label="Research label (optional)"
            name="label"
            value={edit?.label}
          />
          <Text label="Physical set notes" name="notes" value={edit?.notes} />
          {edit && <Input label="Reason for set edit" name="reason" required />}
        </SaveForm>
        {edit && <button onClick={() => setEdit(null)}>Cancel</button>}
      </section>
      <section className="panel">
        <h2>Permanent physical identities</h2>
        {!catalog.sets.length && (
          <p className="empty">
            Create a physical set when you are ready to make manual assignments.
            It is not required for working entry.
          </p>
        )}
        {catalog.sets.map((s: Row) => (
          <article key={s.id}>
            <h3>
              {s.code} <span>{s.label}</span>
            </h3>
            <p>{s.notes}</p>
            <RecordActions
              kind="physical-sets"
              row={s}
              catalog={catalog}
              onChanged={reload}
            />

            <p>
              <button onClick={() => setEdit(s)}>Edit label / notes</button>
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
export function Registers({
  catalog,
  reload,
}: {
  catalog: Row;
  reload: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<"stations" | "types" | null>(null),
    [archived, setArchived] = useState(false),
    [all, setAll] = useState<Row | null>(null);
  async function refresh() {
    await reload();
    if (archived) setAll(await api("/catalog?includeArchived=true"));
  }
  const shown = archived && all ? all : catalog;
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            if (e.target.checked)
              void api("/catalog?includeArchived=true").then(setAll);
          }}
        />
        Include archived entries
      </label>
      <div className="two-columns">
        {(["stations", "types"] as const).map((kind) => (
          <section className="panel" key={kind}>
            <div className="section-head">
              <h2>{kind === "stations" ? "Stations" : "Carriage types"}</h2>
              <button onClick={() => setDialog(kind)}>
                Add {kind === "stations" ? "Station" : "Carriage Type"}
              </button>
            </div>
            {!shown[kind].length && <p className="empty">No entries yet.</p>}
            {shown[kind].map((row: Row) => (
              <article key={row.id}>
                <h3>
                  {row.name} {row.code && `(${row.code})`}{" "}
                  {row.archived && <span className="badge">Archived</span>}
                </h3>
                <p>{row.notes}</p>
                <RecordActions
                  kind={kind}
                  row={row}
                  catalog={catalog}
                  onChanged={refresh}
                />
              </article>
            ))}
          </section>
        ))}
      </div>
      {dialog && (
        <CatalogDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onCreated={refresh}
        />
      )}
    </>
  );
}
export function Formations({
  catalog,
  reload,
}: {
  catalog: Row;
  reload: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Row[]>([]),
    [name, setName] = useState(""),
    [completeness, setCompleteness] = useState("Unknown"),
    [notes, setNotes] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [dialog, setDialog] = useState(false);
  const sum = members.reduce(
      (s, m) => s + (m.quantity == null ? 0 : Number(m.quantity)),
      0,
    ),
    exact =
      completeness === "Known" &&
      members.length > 0 &&
      members.every((m) => m.quantity != null);
  function load(f: Row, copy = false) {
    setEdit(copy ? null : f);
    setName(f.name + (copy ? " — new version" : ""));
    setCompleteness(f.completeness);
    setNotes(f.notes);
    setMembers(f.members.map((m: Row) => ({ ...m })));
  }
  const patch = (i: number, k: string, v: any) =>
    setMembers((ms) => ms.map((m, n) => (n === i ? { ...m, [k]: v } : m)));
  return (
    <div className="two-columns wide-first">
      <section className="panel">
        <h2>{edit ? "Edit formation" : "Add formation"}</h2>
        <p className="muted">
          This describes a composition, not the identity of the physical
          carriages.
        </p>
        <SaveForm
          key={edit?.id || "new"}
          title={edit ? "Save formation changes" : "Save formation"}
          onSave={async (f) => {
            const v = formValues(f);
            await api(
              "/formations" + (edit ? "/" + edit.id : ""),
              edit ? "PUT" : "POST",
              {
                name,
                completeness,
                notes,
                members: members.map((m) => ({
                  typeId: m.typeId || null,
                  quantity: m.quantity == null ? null : Number(m.quantity),
                  position: m.position == null ? null : Number(m.position),
                  vehicleNumber: m.vehicleNumber || null,
                  notes: m.notes || "",
                })),
                ...(edit ? { revision: edit.revision, reason: v.reason } : {}),
              },
            );
            setEdit(null);
            setName("");
            setMembers([]);
            setNotes("");
            setCompleteness("Unknown");
            await reload();
          }}
        >
          <label>
            Formation name
            <input
              aria-label="Formation name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Completeness
            <select
              aria-label="Formation completeness"
              value={completeness}
              onChange={(e) => setCompleteness(e.target.value)}
            >
              <option>Unknown</option>
              <option>Incomplete</option>
              <option>Known</option>
            </select>
          </label>
          <div className="section-head">
            <h3>Members</h3>
            <button type="button" onClick={() => setDialog(true)}>
              Add Carriage Type
            </button>
          </div>
          {members.map((m, i) => (
            <div className="member" key={i}>
              <SearchSelect
                label={"Type for member " + (i + 1)}
                value={m.typeId || ""}
                onChange={(v) => patch(i, "typeId", v)}
                options={catalog.types.map((t: Row) => ({
                  id: t.id,
                  label: t.name + (t.code ? " (" + t.code + ")" : ""),
                }))}
              />
              <div className="fields">
                <label>
                  Quantity (unknown = blank)
                  <input
                    aria-label={"Quantity for member " + (i + 1)}
                    type="number"
                    min={1}
                    max={1000}
                    value={m.quantity ?? ""}
                    onChange={(e) =>
                      patch(
                        i,
                        "quantity",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
                <label>
                  Formation position (optional)
                  <input
                    aria-label={"Position for member " + (i + 1)}
                    type="number"
                    min={1}
                    value={m.position ?? ""}
                    onChange={(e) =>
                      patch(
                        i,
                        "position",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Individual vehicle number (optional)
                <input
                  aria-label={"Vehicle number for member " + (i + 1)}
                  value={m.vehicleNumber || ""}
                  onChange={(e) => patch(i, "vehicleNumber", e.target.value)}
                />
              </label>
              <label>
                Member notes
                <input
                  aria-label={"Notes for member " + (i + 1)}
                  value={m.notes || ""}
                  onChange={(e) => patch(i, "notes", e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => setMembers((ms) => ms.filter((_, n) => n !== i))}
              >
                Remove draft member
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setMembers((ms) => [
                ...ms,
                {
                  typeId: "",
                  quantity: null,
                  position: null,
                  vehicleNumber: "",
                  notes: "",
                },
              ])
            }
          >
            Add formation member
          </button>
          <p className="count">
            {exact
              ? `${sum} carriages in total`
              : sum
                ? `At least ${sum} carriages — incomplete total`
                : "Total unknown"}
          </p>
          <label>
            Formation notes
            <textarea
              aria-label="Formation notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {edit && (
            <>
              <p className="warning">
                Editing updates all workings referencing this formation. Save a
                new version to retain a separate composition.
              </p>
              <Input label="Reason for formation edit" name="reason" required />
            </>
          )}
        </SaveForm>
        {edit && (
          <button
            onClick={() => {
              setEdit(null);
              setMembers([]);
              setName("");
            }}
          >
            Cancel edit
          </button>
        )}
        {dialog && (
          <CatalogDialog
            kind="types"
            onClose={() => setDialog(false)}
            onCreated={async () => reload()}
          />
        )}
      </section>
      <section className="panel">
        <h2>Formation register</h2>
        {!catalog.formations.length && (
          <p className="empty">
            Formations may be unknown. You can enter workings before recording a
            composition.
          </p>
        )}
        {catalog.formations.map((f: Row) => (
          <article key={f.id}>
            <h3>{f.name}</h3>
            <p>
              <span className="badge">{f.completeness}</span>{" "}
              {f.count.description}
            </p>
            {f.members.map((m: Row) => (
              <p key={m.id}>
                {m.quantity ?? "?"} × {m.type?.name || "unknown type"}
                {m.position != null && ` · position ${m.position}`}
                {m.vehicleNumber && ` · vehicle ${m.vehicleNumber}`}
              </p>
            ))}
            <p>{f.notes}</p>
            <RecordActions
              kind="formations"
              row={f}
              catalog={catalog}
              onChanged={reload}
            />
            <button onClick={() => load(f)}>Edit formation</button>
            <button onClick={() => load(f, true)}>Use as new version</button>
          </article>
        ))}
      </section>
    </div>
  );
}
