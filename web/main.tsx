import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./style.css";
GlobalWorkerOptions.workerSrc = workerUrl;
type RecordData = Record<string, any>;
const week = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const reviewStatuses = [
  "Not reviewed",
  "Needs correction",
  "Partially verified",
  "Verified against source",
  "Connection unresolved",
  "Ready for export",
];
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
const values = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form).entries());
function Field({
  label,
  name,
  value = "",
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value?: any;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
      />
    </label>
  );
}
function Text({
  label,
  name,
  value = "",
}: {
  label: string;
  name: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <textarea name={name} defaultValue={value} />
    </label>
  );
}
function PDFViewer({
  fileId,
  startPage = 1,
}: {
  fileId: string;
  startPage?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(startPage);
  const [zoom, setZoom] = useState(1.1);
  const [pdf, setPdf] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setPage(startPage);
    setError("");
    setPdf(null);
    const task = getDocument("/api/files/" + fileId);
    task.promise.then(setPdf).catch((e) => setError(e.message));
    return () => {
      void task.destroy();
    };
  }, [fileId]);
  useEffect(() => setPage(startPage), [startPage]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let render: any;
    pdf
      .getPage(page)
      .then((p: any) => {
        if (cancelled) return;
        const viewport = p.getViewport({ scale: zoom });
        const c = canvas.current!;
        c.width = viewport.width;
        c.height = viewport.height;
        render = p.render({ canvasContext: c.getContext("2d"), viewport });
        return render.promise;
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page, zoom]);
  return (
    <section className="pdf">
      <div className="toolbar">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <label>
          PDF page{" "}
          <input
            aria-label="PDF page"
            type="number"
            min={1}
            max={pdf?.numPages || 1}
            value={page}
            onChange={(e) =>
              setPage(
                Math.max(
                  1,
                  Math.min(pdf?.numPages || 1, Number(e.target.value) || 1),
                ),
              )
            }
          />
        </label>
        <span>of {pdf?.numPages ?? "…"}</span>
        <button
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
        <button onClick={() => setZoom(Math.max(0.3, zoom - 0.2))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(4, zoom + 0.2))}>+</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="paper">
        <canvas ref={canvas} />
      </div>
    </section>
  );
}
function App() {
  const [tab, setTab] = useState("Dashboard");
  const [docs, setDocs] = useState<RecordData[]>([]);
  const [diagrams, setDiagrams] = useState<RecordData[]>([]);
  const [stations, setStations] = useState<RecordData[]>([]);
  const [stats, setStats] = useState<RecordData>({});
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [history, setHistory] = useState<RecordData[]>([]);
  const [pdf, setPdf] = useState<{ fileId: string; page: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState(false);
  const [editingMovement, setEditingMovement] = useState<RecordData | null>(
    null,
  );
  async function refresh() {
    const [a, b, c, d] = await Promise.all([
      api("/documents"),
      api("/diagrams"),
      api("/stations"),
      api("/dashboard"),
    ]);
    setDocs(a);
    setDiagrams(b);
    setStations(c);
    setStats(d);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNotice("Saved.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    const d = await api("/diagrams/" + id);
    setSelected(d);
    setHistory(await api("/diagrams/" + id + "/history"));
    setEditingMovement(null);
    setTab("Diagrams");
  }
  const stationName = (id: string) =>
    stations.find((s) => s.id === id)?.name || "Unknown";
  const filtered = diagrams.filter(
    (d) =>
      (!search ||
        [
          d.publishedNumber,
          d.title,
          ...d.movements.flatMap((m: any) => [
            m.trainNumber,
            m.origin?.name,
            m.destination?.name,
          ]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!focus ||
        d.movements.some((m: any) =>
          [m.origin?.name, m.destination?.name].some((n) =>
            ["York", "Scarborough", "Huttons Ambo"].includes(n),
          ),
        )),
  );
  const fmt = (n: number | null) =>
    n == null
      ? "Unknown"
      : `${Math.floor(n / 60)
          .toString()
          .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
  const time = (v: FormDataEntryValue | undefined) => {
    if (!v) return null;
    const s = String(v);
    if (!/^\d{1,3}:[0-5]\d$/.test(s))
      throw new Error(
        "Enter times as HH:MM, using 24:20 for a known next-day time.",
      );
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const stationSelect = (name: string, label: string, value?: string) => (
    <label>
      {label}
      <select aria-label={label} name={name} defaultValue={value || ""}>
        <option value="">Unknown</option>
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  const diagramForm = (d: RecordData | null) => (
    <form
      key={d?.id || "new"}
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        void action(async () => {
          const v = values(f);
          const body = {
            ...v,
            documentId: v.documentId || null,
            operatingDays: new FormData(f).getAll("operatingDays"),
            ...(d ? { revision: d.revision } : {}),
          };
          const r = await api(
            "/diagrams" + (d ? "/" + d.id : ""),
            d ? "PUT" : "POST",
            body,
          );
          await open(r.id);
        });
      }}
    >
      <div className="grid">
        <Field
          label="Published diagram/set number (if known)"
          name="publishedNumber"
          value={d?.publishedNumber}
        />
        <Field label="Research title" name="title" value={d?.title} />
        <label>
          Source document
          <select name="documentId" defaultValue={d?.documentId || ""}>
            <option value="">Not yet identified</option>
            {docs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} {x.sourceDate && `(${x.sourceDate})`}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Operating period"
          name="operatingPeriod"
          value={d?.operatingPeriod}
        />
      </div>
      <fieldset>
        <legend>Applicable days — leave empty if unknown</legend>
        {week.map((day) => (
          <label className="check" key={day}>
            <input
              type="checkbox"
              name="operatingDays"
              value={day}
              defaultChecked={d?.operatingDays?.includes(day)}
            />
            {day.slice(0, 3)}
          </label>
        ))}
      </fieldset>
      <Text
        label="Calendar exceptions and uncertainty"
        name="calendarNotes"
        value={d?.calendarNotes}
      />
      <Text
        label="Published composition (does not identify physical vehicles)"
        name="compositionText"
        value={d?.compositionText}
      />
      <Text
        label="Published instructions"
        name="instructions"
        value={d?.instructions}
      />
      <Text label="Research notes" name="notes" value={d?.notes} />
      <button disabled={busy} className="primary">
        {d ? "Save diagram changes" : "Create incomplete diagram"}
      </button>
    </form>
  );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          LNER
          <span>
            Carriage Working
            <br />
            Analyser
          </span>
        </div>
        <div className="edition">PERSONAL RESEARCH • PHASE 1</div>
        <nav>
          {["Dashboard", "Documents", "Diagrams", "Stations"].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => {
                setTab(t);
                setPdf(null);
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <p className="scope">
          Research focus
          <br />
          <strong>York → Scarborough</strong>
          <br />
          Including Huttons Ambo
        </p>
        <p className="muted">
          OCR, rotation analysis and export follow in later phases.
        </p>
      </aside>
      <main>
        <header>
          <div>
            <small>HISTORICAL RAILWAY RESEARCH</small>
            <h1>
              {tab === "Diagrams" && selected
                ? `Diagram ${selected.publishedNumber || "—"}`
                : tab}
            </h1>
          </div>
          <span className="badge">Standalone · local storage</span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {tab === "Dashboard" && (
          <>
            <p className="intro">
              Build a source-backed record of the workings you want to study.
              Unknown details can stay unknown.
            </p>
            <div className="cards">
              {[
                ["Documents", stats.documents],
                ["Diagrams", stats.diagrams],
                ["Movements", stats.movements],
                ["Verified diagrams", stats.verified],
              ].map(([k, v]) => (
                <section className="card" key={k}>
                  <span>{k}</span>
                  <strong>{v ?? "—"}</strong>
                </section>
              ))}
            </div>
            <div className="grid">
              <section className="panel">
                <h2>Begin your research</h2>
                <ol>
                  <li>Upload an original PDF in Documents.</li>
                  <li>Create a selected carriage working manually.</li>
                  <li>Add movements and cite the relevant source pages.</li>
                  <li>Review the transcription against the original.</li>
                </ol>
                <button className="primary" onClick={() => setTab("Documents")}>
                  Open document library
                </button>
              </section>
              <section className="panel">
                <h2>Research boundaries</h2>
                <p>
                  Published diagrams are separate from physical stock. Timetable
                  train columns are not automatically carriage-set numbers.
                </p>
                <p>
                  The 1937 timetable and 1939 roster remain separate sources. No
                  historical data has been pre-filled.
                </p>
              </section>
            </div>
            <section className="panel">
              <h2>Recent research activity</h2>
              {!stats.activity?.length ? (
                <p className="muted">
                  Your research activity will appear here.
                </p>
              ) : (
                stats.activity.map((a: any) => (
                  <p key={a.id}>
                    {a.action} · {a.entityType}{" "}
                    <small>{new Date(a.createdAt).toLocaleString()}</small>
                  </p>
                ))
              )}
            </section>
          </>
        )}
        {tab === "Documents" && (
          <>
            <div className="grid">
              <section className="panel">
                <h2>Add a source PDF</h2>
                <p className="muted">
                  Originals are retained unchanged. Upload the whole PDF and
                  enter only selected workings. Maximum 100 MB.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const body = new FormData(form);
                    void action(async () => {
                      await api("/documents", "POST", body);
                      form.reset();
                    });
                  }}
                >
                  <Field label="Document title" name="title" required />
                  <div className="grid">
                    <Field label="Source date (as printed)" name="sourceDate" />
                    <Field label="Operating period" name="operatingPeriod" />
                  </div>
                  <Field label="Railway / region" name="region" />
                  <Text label="Description" name="description" />
                  <label>
                    Original scanned PDF
                    <input
                      name="file"
                      type="file"
                      accept="application/pdf,.pdf"
                      required
                    />
                  </label>
                  <button disabled={busy} className="primary">
                    {busy ? "Saving…" : "Upload PDF"}
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>Source library</h2>
                {!docs.length && (
                  <p>
                    No source documents uploaded yet. The images shared in chat
                    have not been imported as PDFs.
                  </p>
                )}
                {docs.map((d) => (
                  <article key={d.id}>
                    <h3>{d.title}</h3>
                    <p>
                      {d.sourceDate || "Date unknown"} ·{" "}
                      {d.region || "Region unknown"}
                    </p>
                    <p>{d.description}</p>
                    {d.files.map((f: any) => (
                      <div key={f.id}>
                        <p>{f.pageCount} pages · original preserved</p>
                        <button
                          onClick={() => setPdf({ fileId: f.id, page: 1 })}
                        >
                          View PDF
                        </button>
                        <a
                          className="button"
                          href={"/api/files/" + f.id}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open original
                        </a>
                        <details>
                          <summary>Printed page labels</summary>
                          {f.pages.map((p: any) => (
                            <form
                              className="inline"
                              key={p.id}
                              onSubmit={(e) => {
                                e.preventDefault();
                                const v = values(e.currentTarget);
                                void action(async () => {
                                  await api("/pages/" + p.id, "PATCH", {
                                    printedLabel: v.printedLabel || null,
                                  });
                                });
                              }}
                            >
                              <span>PDF {p.pdfPage}</span>
                              <input
                                aria-label={"Printed page for PDF " + p.pdfPage}
                                name="printedLabel"
                                defaultValue={p.printedLabel || ""}
                                placeholder="Printed page / unknown"
                              />
                              <button disabled={busy}>Save</button>
                            </form>
                          ))}
                        </details>
                      </div>
                    ))}
                  </article>
                ))}
              </section>
            </div>
            {pdf && <PDFViewer fileId={pdf.fileId} startPage={pdf.page} />}
          </>
        )}
        {tab === "Stations" && (
          <div className="grid">
            <section className="panel">
              <h2>Station register</h2>
              <p>Register historical names without changing source text.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  void action(async () => {
                    const v = values(f);
                    await api("/stations", "POST", {
                      name: v.name,
                      aliases: String(v.aliases)
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    });
                    f.reset();
                  });
                }}
              >
                <Field label="Station name" name="name" required />
                <Field label="Aliases (comma separated)" name="aliases" />
                <button disabled={busy} className="primary">
                  Add station
                </button>
              </form>
            </section>
            <section className="panel">
              <h2>Registered stations</h2>
              {!stations.length && (
                <p>
                  Add York, Scarborough and intermediate stations as you
                  encounter them in the sources.
                </p>
              )}
              {stations.map((s) => (
                <article key={s.id}>
                  <strong>{s.name}</strong>
                  <p>
                    {s.aliases.map((a: any) => a.name).join(", ") ||
                      "No aliases recorded"}
                  </p>
                </article>
              ))}
            </section>
          </div>
        )}
        {tab === "Diagrams" && !selected && (
          <>
            <div className="toolbar">
              <input
                aria-label="Search diagrams"
                placeholder="Search diagram, train or station…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={focus}
                  onChange={(e) => setFocus(e.target.checked)}
                />
                York / Scarborough / Huttons Ambo endpoints
              </label>
            </div>
            <p className="muted">
              This Phase 1 filter checks recorded movement endpoints.
              Intermediate-call searching follows in Phase 3.
            </p>
            <div className="grid">
              <section className="panel">
                <h2>Selected workings</h2>
                {!filtered.length && (
                  <p>
                    No matching workings. Create a record using the form;
                    uncertain fields can remain blank.
                  </p>
                )}
                {filtered.map((d) => (
                  <article key={d.id}>
                    <button
                      className="link"
                      onClick={() => void action(() => open(d.id))}
                    >
                      Diagram {d.publishedNumber || "—"} {d.title}
                    </button>
                    <p>
                      {d.document?.title || "Source not identified"} ·{" "}
                      {d.status}
                    </p>
                    <p>
                      {d.movements.length} movements ·{" "}
                      {d.operatingDays.join(", ") || "Days unknown"}
                    </p>
                  </article>
                ))}
              </section>
              <section className="panel">
                <h2>New daily diagram</h2>
                {diagramForm(null)}
              </section>
            </div>
          </>
        )}
        {tab === "Diagrams" && selected && (
          <>
            <button
              onClick={() => {
                setSelected(null);
                setPdf(null);
              }}
            >
              ← All diagrams
            </button>
            <p>
              {selected.document?.title || "Source not identified"} ·{" "}
              {selected.document?.sourceDate || "Date unknown"}{" "}
              <span className="badge">{selected.status}</span>
            </p>
            <p className="muted">
              Physical stock assignment: unknown. This record represents a daily
              published working, not a permanent physical set.
            </p>
            <div className="grid">
              <section className="panel">
                <h2>Diagram details</h2>
                {diagramForm(selected)}
              </section>
              <section className="panel">
                <h2>Train movements</h2>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Order / Train</th>
                        <th>From → To</th>
                        <th>Departure / Arrival</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {selected.movements.map((m: any) => (
                        <tr key={m.id}>
                          <td>
                            {m.sequence} / {m.trainNumber || "Unknown"}
                          </td>
                          <td>
                            {stationName(m.originId)} →{" "}
                            {stationName(m.destinationId)}
                          </td>
                          <td>
                            {fmt(m.departureMinutes)} / {fmt(m.arrivalMinutes)}
                          </td>
                          <td>
                            <button onClick={() => setEditingMovement(m)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!selected.movements.length && <p>No movements entered.</p>}
                <h3>{editingMovement ? "Edit movement" : "Add movement"}</h3>
                <form
                  key={editingMovement?.id || selected.movements.length}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    void action(async () => {
                      const v = values(f);
                      const body = {
                        ...v,
                        sequence: Number(v.sequence),
                        originId: v.originId || null,
                        destinationId: v.destinationId || null,
                        departureMinutes: time(v.departureTime),
                        arrivalMinutes: time(v.arrivalTime),
                      };
                      await api(
                        editingMovement
                          ? "/movements/" + editingMovement.id
                          : "/diagrams/" + selected.id + "/movements",
                        editingMovement ? "PUT" : "POST",
                        body,
                      );
                      await open(selected.id);
                    });
                  }}
                >
                  <div className="grid">
                    <Field
                      label="Sequence"
                      name="sequence"
                      type="number"
                      value={
                        editingMovement?.sequence ??
                        selected.movements.length + 1
                      }
                      required
                    />
                    <Field
                      label="Published train number"
                      name="trainNumber"
                      value={editingMovement?.trainNumber}
                    />
                    {stationSelect(
                      "originId",
                      "From",
                      editingMovement?.originId,
                    )}
                    {stationSelect(
                      "destinationId",
                      "To",
                      editingMovement?.destinationId,
                    )}
                    <Field
                      label="Departure HH:MM (unknown = blank)"
                      name="departureTime"
                      value={
                        editingMovement?.departureMinutes == null
                          ? ""
                          : fmt(editingMovement.departureMinutes)
                      }
                    />
                    <Field
                      label="Arrival HH:MM (24:20 = next day)"
                      name="arrivalTime"
                      value={
                        editingMovement?.arrivalMinutes == null
                          ? ""
                          : fmt(editingMovement.arrivalMinutes)
                      }
                    />
                  </div>
                  <Field
                    label="Original printed time notation"
                    name="originalTimeText"
                    value={editingMovement?.originalTimeText}
                  />
                  <label>
                    Activity
                    <select
                      name="activity"
                      defaultValue={editingMovement?.activity || "Unknown"}
                    >
                      {[
                        "Unknown",
                        "Passenger",
                        "Empty coaching stock",
                        "Shunting",
                        "Other",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <Text
                    label="Movement notes / uncertainty"
                    name="notes"
                    value={editingMovement?.notes}
                  />
                  <button className="primary" disabled={busy}>
                    Save movement
                  </button>
                  {editingMovement && (
                    <button
                      type="button"
                      onClick={() => setEditingMovement(null)}
                    >
                      Cancel edit
                    </button>
                  )}
                </form>
              </section>
            </div>
            <div className="grid">
              <section className="panel">
                <h2>Source evidence</h2>
                {selected.evidence.map((e: any) => (
                  <article key={e.id}>
                    <button
                      onClick={() =>
                        setPdf({ fileId: e.page.fileId, page: e.page.pdfPage })
                      }
                    >
                      Open PDF page {e.page.pdfPage}
                      {e.page.printedLabel
                        ? ` · printed ${e.page.printedLabel}`
                        : ""}
                    </button>
                    <p>
                      <strong>Original:</strong>{" "}
                      {e.originalText || "Not transcribed"}
                    </p>
                    <p>
                      <strong>Transcription:</strong>{" "}
                      {e.transcription || "Not transcribed"}
                    </p>
                    <p>{e.notes}</p>
                  </article>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    void action(async () => {
                      await api(
                        "/diagrams/" + selected.id + "/evidence",
                        "POST",
                        values(f),
                      );
                      await open(selected.id);
                      f.reset();
                    });
                  }}
                >
                  <label>
                    Source page
                    <select aria-label="Source page" name="pageId" required>
                      <option value="">Select source page</option>
                      {docs.flatMap((d) =>
                        d.files.flatMap((f: any) =>
                          f.pages.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {d.title} · PDF {p.pdfPage}
                              {p.printedLabel
                                ? ` · printed ${p.printedLabel}`
                                : ""}
                            </option>
                          )),
                        ),
                      )}
                    </select>
                  </label>
                  <Text
                    label="Original source text (preserve spelling)"
                    name="originalText"
                  />
                  <Text label="Corrected transcription" name="transcription" />
                  <Text
                    label="Interpretation and uncertainty notes"
                    name="notes"
                  />
                  <button disabled={busy || !docs.length}>
                    Add source citation
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>Verification</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    void action(async () => {
                      await api(
                        "/diagrams/" + selected.id + "/verification",
                        "POST",
                        values(f),
                      );
                      await open(selected.id);
                    });
                  }}
                >
                  <label>
                    Review status
                    <select
                      aria-label="Review status"
                      name="status"
                      defaultValue={selected.status}
                    >
                      {reviewStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review rationale
                    <textarea name="notes" required />
                  </label>
                  <button disabled={busy}>Record review</button>
                </form>
                <h3>Review history</h3>
                {selected.verifications.map((v: any) => (
                  <p key={v.id}>
                    {v.status} — {v.notes}
                  </p>
                ))}
                <details>
                  <summary>Audit history ({history.length})</summary>
                  {history.map((h) => (
                    <p key={h.id}>
                      {h.action} · {new Date(h.createdAt).toLocaleString()}
                    </p>
                  ))}
                </details>
              </section>
            </div>
            {pdf && <PDFViewer fileId={pdf.fileId} startPage={pdf.page} />}
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
