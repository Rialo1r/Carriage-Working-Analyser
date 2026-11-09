import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, Row, workingLabel, dayLabel, timeLabel, readableResearch } from "./common";
import {
  DiagramPage,
  PhysicalSets,
  Registers,
  Formations,
} from "./CatalogPages";
import { RosterIndex,AddRosterSet } from "./Roster";
import { WorkingEditor, WorkingDetail } from "./Workings";
import { Timetable } from "./Timetable";
import "./style.css";
function App() {
  const [tab, setTab] = useState("Dashboard"),
    [catalog, setCatalog] = useState<Row | null>(null),
    [workings, setWorkings] = useState<Row[]>([]),
    [stats, setStats] = useState<Row>({}),
    [selected, setSelected] = useState<Row | null>(null),
    [editing, setEditing] = useState(false),
    [copy, setCopy] = useState(false),
    [copyDays, setCopyDays] = useState<number[] | undefined>(),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [history, setHistory] = useState<Row[]>([]);
  const selectedId = useRef<string | null>(null);
  const navigation = useRef(0);
  async function refresh() {
    const [c, w, s] = await Promise.all([
      api("/catalog"),
      api("/workings"),
      api("/dashboard"),
    ]);
    setCatalog(c);
    setWorkings(w);
    setStats(s);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function openWorking(id: string) {
    try {
      setError("");
      const request = ++navigation.current;
      const working = await api("/workings/" + id);
      if (request !== navigation.current) return;
      selectedId.current = id;
      setSelected(working);
      setDraft(null);
      setEditing(false);
      setCopy(false);
      setTab("Workings");
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function changed() {
    await refresh();
    if (selected && selectedId.current === selected.id) {
      const request = navigation.current;
      const working = await api("/workings/" + selected.id);
      if (selectedId.current === selected.id && request === navigation.current)
        setSelected(working);
    }
  }
  const titles: Record<string, string> = {
    Dashboard: "Your research desk",
    Workings: editing
      ? copy
        ? "Copy daily working"
        : selected
          ? "Edit daily working"
          : "Add Working"
      : selected
        ? "Working details"
        : "Carriage roster",
    "Published Diagrams": "Published diagram register",
    "Physical Sets": "Physical carriage sets",
    Formations: "Carriage formations",
    "Weekly Timetable": "Weekly working timetable",
    Registers: "Stations & carriage types",
    History: "Research history",
  };
  const nav = [
    "Dashboard",
    "Workings",
    "Published Diagrams",
    "Physical Sets",
    "Formations",
    "Weekly Timetable",
    "Registers",
    "History",
  ];
  const [addSet,setAddSet]=useState(false),[draft,setDraft]=useState<Row|null>(null);
  function addWorking(diagramId?:string) {
    navigation.current++;
    selectedId.current = null;
    setSelected(null);
    setDraft(diagramId?{diagramId}:null);
    setCopy(false);
    setCopyDays(undefined);
    setEditing(true);
    setTab("Workings");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("Dashboard");
          }}
        >
          <span className="roundel">LNER</span>
          <strong>
            Carriage Working
            <br />& Rotation Planner
          </strong>
        </a>
        <p className="edition">PERSONAL RESEARCH · PHASE 1</p>
        <nav aria-label="Main navigation">
          {nav.map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setError("");
                if (t === "History")
                  void api("/history")
                    .then(setHistory)
                    .catch((e) => setError(e.message));
                if (t === "Dashboard")
                  void refresh().catch((e) => setError(e.message));
              }}
            >
              {t === "Registers" ? "Stations & Types" : t === "Workings" ? "Carriage Roster" : t}
            </button>
          ))}
        </nav>
        <div className="phase-note">
          <strong>Manual entry foundation</strong>
          <p>
            Continuity checking and automatic rotations will follow after
            approval.
          </p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>LNER HISTORICAL CARRIAGE RESEARCH</small>
            <h1>{titles[tab]}</h1>
          </div>
          <span className="badge">Standalone · local database</span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              onClick={() =>
                void refresh()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              Retry loading
            </button>
          </div>
        )}
        {!catalog && !error && <p>Loading your research database…</p>}
        {catalog&&addSet&&<AddRosterSet catalog={catalog} onClose={()=>setAddSet(false)} onAdded={async d=>{await refresh();addWorking(d.id);}}/>}
        {catalog && (
          <>
            {tab === "Dashboard" && (
              <>
                <div className="welcome">
                  <div>
                    <h2>Start with what the roster tells you.</h2>
                    <p>
                      Enter published workings, their days and their
                      next-working instructions. Leave physical identities and
                      uncertain details open until you have the evidence.
                    </p>
                    <button className="primary" onClick={()=>addWorking()}>
                      Add Working
                    </button>
                    <button onClick={() => setTab("Published Diagrams")}>
                      Add Published Diagram
                    </button>
                  </div>
                  <div className="welcome-mark">
                    262<span>Mon → Sun</span>
                    <small>Published number ≠ physical set</small>
                  </div>
                </div>
                <div className="stat-grid">
                  {[
                    ["Published diagrams", stats.diagrams],
                    ["Daily working definitions", stats.workings],
                    ["Physical sets", stats.physicalSets],
                    ["Manual assignments", stats.assignments],
                  ].map(([label, value]) => (
                    <section className="stat" key={label}>
                      <strong>{value ?? 0}</strong>
                      <span>{label}</span>
                    </section>
                  ))}
                </div>
                <div className="two-columns">
                  <section className="panel">
                    <h2>A simple entry workflow</h2>
                    <ol>
                      <li>
                        Add the stations, carriage types and historical period
                        you need.
                      </li>
                      <li>Add a published number, then its weekday working.</li>
                      <li>
                        Copy the working for a Saturday or Sunday variant.
                      </li>
                      <li>
                        Select the exact next working and retain the source
                        wording.
                      </li>
                      <li>
                        Create a physical set when ready, then assign dated
                        workings manually.
                      </li>
                    </ol>
                  </section>
                  <section className="panel">
                    <h2>Research stays under your control</h2>
                    <p>
                      Published numbers and physical-set identities are
                      separate. Two Mondays in different weeks are different
                      occurrences.
                    </p>
                    <p>
                      Phase 1 does not infer connections, verify rotations,
                      process PDFs or run OCR. No historical examples have been
                      preloaded.
                    </p>
                  </section>
                </div>
                <section className="panel">
                  <h2>Recent activity</h2>
                  {!stats.recent?.length && (
                    <p className="empty">
                      Your entries and edits will appear here.
                    </p>
                  )}
                  {stats.recent?.map((e: Row) => (
                    <article key={e.id}>
                      <strong>
                        {e.action} · {e.entityType}
                      </strong>
                      <p>{e.reason}</p>
                      <small>{new Date(e.createdAt).toLocaleString()}</small>
                    </article>
                  ))}
                </section>
              </>
            )}
            {tab === "Published Diagrams" && (
              <DiagramPage catalog={catalog} reload={refresh} />
            )}
            {tab === "Physical Sets" && (
              <PhysicalSets catalog={catalog} reload={refresh} />
            )}
            {tab === "Registers" && (
              <Registers catalog={catalog} reload={refresh} />
            )}
            {tab === "Formations" && (
              <Formations catalog={catalog} reload={refresh} />
            )}
            {tab === "Weekly Timetable" && (
              <Timetable onOpen={(id) => void openWorking(id)} />
            )}
            {tab === "Workings" &&
              (editing ? (
                <WorkingEditor
                  key={
                    (selected?.id || "new") +
                    (copy ? "copy" : "edit") +
                    (copyDays?.join(",") || "")
                  }
                  catalog={catalog}
                  working={selected||draft}
                  copy={copy}
                  copyDays={copyDays}
                  reload={refresh}
                  onCancel={() => {
                    setEditing(false);
                    if (copy) {
                      navigation.current++;
                      selectedId.current = null;
                      setSelected(null);
                    }
                    setCopy(false);
                  }}
                  onSaved={async (w) => {
                    await refresh();
                    await openWorking(w.id);
                  }}
                />
              ) : selected ? (
                <WorkingDetail
                  working={selected}
                  workings={workings}
                  catalog={catalog}
                  onBack={() => {
                    navigation.current++;
                    selectedId.current = null;
                    setSelected(null);
                  }}
                  onEdit={() => {
                    setCopy(false);
                    setCopyDays(undefined);
                    setEditing(true);
                  }}
                  onCopy={(d) => {
                    setCopyDays(d);
                    setCopy(true);
                    setEditing(true);
                  }}
                  onChanged={changed}
                />
              ) : (
                <RosterIndex catalog={catalog} workings={workings} onAdd={addWorking} onNewSet={()=>setAddSet(true)} onOpen={id=>void openWorking(id)} reload={refresh}/>
              ))}
            {tab === "History" && (
              <section className="panel">
                <h2>Significant edits and manual decisions</h2>
                <p>
                  The latest 200 events are shown. Prior values are retained in
                  each edit record.
                </p>
                {!history.length && (
                  <p className="empty">No research history yet.</p>
                )}
                {history.map((e) => (
                  <article key={e.id}>
                    <strong>
                      {e.action} · {e.entityType}
                    </strong>
                    <p>{e.reason}</p>
                    <small>
                      {new Date(e.createdAt).toLocaleString()}
                    </small>
                    <details>
                      <summary>Inspect retained before / after values</summary>
                      <pre>
                        {JSON.stringify(
                          { before: readableResearch(e.before), after: readableResearch(e.after) },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
