import React, { useState } from "react";
import { request } from "./OcrWorkspace";
import { ResearchForm, Row, useResearch, timeLabel } from "./ResearchUI";
function EvidenceLinks({ diagram }: { diagram: Row }) {
  return (
    <>
      {diagram.evidence?.map((e: Row) => (
        <a
          className="button"
          key={e.id}
          href={"/api/files/" + e.page.fileId + "#page=" + e.page.pdfPage}
          target="_blank"
          rel="noreferrer"
        >
          Source PDF {e.page.pdfPage}
          {e.page.printedLabel ? ` / printed ${e.page.printedLabel}` : ""}
        </a>
      ))}
    </>
  );
}
export function ConnectionCard({
  link,
  diagrams,
  onDone,
  onOpen,
}: {
  link: Row;
  diagrams: Row[];
  onDone: () => void;
  onOpen: (id: string) => void;
}) {
  const from = diagrams.find((d) => d.id === link.fromId) || link.from,
    to = diagrams.find((d) => d.id === link.toId) || link.to;
  const evidence = [...(from.evidence || []), ...(to.evidence || [])];
  return (
    <article
      className={
        "connection " + (link.confidence === "Conflict" ? "conflicting" : "")
      }
    >
      <h3>
        <button onClick={() => onOpen(from.id)}>
          Diagram {from.publishedNumber || "?"}
        </button>{" "}
        →{" "}
        <button onClick={() => onOpen(to.id)}>
          Diagram {to.publishedNumber || "?"}
        </button>{" "}
        · +{link.dayOffset} day(s)
      </h3>
      <p>
        <span className="badge">{link.confidence}</span>{" "}
        <span className="badge">{link.decision}</span> {link.kind}
      </p>
      <ul>
        {link.checks.map((c: Row) => (
          <li key={c.name}>
            <strong>
              {c.name}: {c.state}
            </strong>{" "}
            — {c.reason}
          </li>
        ))}
      </ul>
      <p>{link.rationale}</p>
      <EvidenceLinks diagram={from} />
      <EvidenceLinks diagram={to} />
      <details>
        <summary>Review this connection</summary>
        <ResearchForm
          title="Record connection decision"
          fields={[
            {
              name: "decision",
              label: "Research decision",
              type: "select",
              value: link.decision,
              options: ["Pending", "Approved", "Rejected"].map((value) => ({
                value,
                label: value,
              })),
            },
            {
              name: "confidence",
              label: "Evidence confidence",
              type: "select",
              value: link.confidence,
              options: [
                "Confirmed",
                "Probable",
                "Possible",
                "Conflict",
                "Unknown",
              ].map((value) => ({ value, label: value })),
            },
            {
              name: "evidenceId",
              label: "Explicit continuation evidence (required for Confirmed)",
              type: "select",
              options: [
                { value: "", label: "No explicit continuation citation" },
                ...evidence.map((e: Row) => ({
                  value: e.id,
                  label: `${e.originalText.slice(0, 80) || "Citation"} · PDF ${e.page.pdfPage}`,
                })),
              ],
            },
            {
              name: "rationale",
              label: "Review rationale / uncertainty",
              type: "textarea",
              required: true,
              value: link.rationale,
            },
          ]}
          onSave={(v) =>
            request("/connections/" + link.id + "/review", "POST", {
              ...v,
              evidenceId: v.evidenceId || undefined,
            })
          }
          onDone={onDone}
        />
      </details>
    </article>
  );
}
export function RotationWorkspace({
  diagrams,
  onOpen,
}: {
  diagrams: Row[];
  onOpen: (id: string) => void;
}) {
  const formations = useResearch("/formations");
  const sets = [
    ...new Map(
      (formations.data || [])
        .filter((f: Row) => f.physicalSet)
        .map((f: Row) => [f.physicalSet.id, f.physicalSet]),
    ).values(),
  ] as Row[];
  const scenarios = useResearch("/scenarios"),
    [scenarioId, setScenarioId] = useState(""),
    [error, setError] = useState("");
  const detail = useResearch(
    "/scenarios/" + (scenarioId || "00000000-0000-4000-8000-000000000000"),
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const data = scenarioId ? detail.data : null;
  const options = diagrams.map((d) => ({
    value: d.id,
    label: `${d.publishedNumber || "?"} · ${d.title || d.document?.title || "Source unknown"}`,
  }));
  return (
    <>
      <p>
        Analyse an explicit date range and source selection. Approved hypotheses
        remain distinct from source-confirmed continuity.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="grid">
        <section className="panel">
          <h2>Analysis scenarios</h2>
          <label>
            Open scenario
            <select
              aria-label="Open rotation scenario"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              <option value="">Choose scenario</option>
              {scenarios.data?.map((s: Row) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <h3>Diagrams for a new scenario</h3>
          {diagrams.map((d) => (
            <label className="check" key={d.id}>
              <input
                type="checkbox"
                checked={chosen.includes(d.id)}
                onChange={(e) =>
                  setChosen((a) =>
                    e.target.checked
                      ? [...a, d.id]
                      : a.filter((id) => id !== d.id),
                  )
                }
              />{" "}
              {d.publishedNumber || d.title || "Unknown diagram"}
            </label>
          ))}
          <ResearchForm
            title="Create analysis scenario"
            fields={[
              { name: "name", label: "Scenario name", required: true },
              {
                name: "startDate",
                label: "First date",
                type: "date",
                required: true,
              },
              {
                name: "endDate",
                label: "Last date",
                type: "date",
                required: true,
              },
              {
                name: "assumptions",
                label: "Source periods, calendar assumptions and uncertainty",
                type: "textarea",
                required: true,
              },
            ]}
            onSave={(v) =>
              request("/scenarios", "POST", { ...v, diagramIds: chosen })
            }
            onDone={scenarios.reload}
          />
        </section>
        <section className="panel">
          <h2>Connection rules</h2>
          <p>
            Station matches never confirm stock identity. Calendar, time and
            composition checks are shown separately.
          </p>
          <p>
            A different finishing/starting station stays an unresolved gap
            unless a source-cited transfer is recorded. No empty-stock move is
            invented.
          </p>
          {data && (
            <>
              <h3>{data.scenario.name}</h3>
              <p>
                {data.scenario.startDate.slice(0, 10)} →{" "}
                {data.scenario.endDate.slice(0, 10)}
              </p>
              <p>{data.scenario.assumptions}</p>
              <button
                className="primary"
                onClick={() => {
                  setError("");
                  request("/scenarios/" + scenarioId + "/analyse", "POST", {})
                    .then(detail.reload)
                    .catch((e) => setError(e.message));
                }}
              >
                Suggest next-day connections
              </button>
            </>
          )}
        </section>
      </div>
      {data && (
        <>
          <section className="panel">
            <h2>Candidate and reviewed connections</h2>
            {!data.transitions.length && (
              <p>
                No links yet. Run suggestions or record a manual connection
                below.
              </p>
            )}
            {data.transitions.map((l: Row) => (
              <ConnectionCard
                key={l.id}
                link={l}
                diagrams={data.diagrams}
                onDone={detail.reload}
                onOpen={onOpen}
              />
            ))}
          </section>
          <div className="grid">
            <section className="panel">
              <ResearchForm
                title="Record manual connection or gap"
                fields={[
                  {
                    name: "fromId",
                    label: "Previous diagram",
                    type: "select",
                    required: true,
                    options: options.filter((o) =>
                      data.scenario.diagramIds.includes(o.value),
                    ),
                  },
                  {
                    name: "toId",
                    label: "Next diagram",
                    type: "select",
                    required: true,
                    options: options.filter((o) =>
                      data.scenario.diagramIds.includes(o.value),
                    ),
                  },
                  {
                    name: "dayOffset",
                    label: "Days to next working",
                    type: "number",
                    required: true,
                    value: 1,
                  },
                  {
                    name: "transferMovementId",
                    label: "Documented transfer movement UUID (optional)",
                  },
                  {
                    name: "rationale",
                    label: "Reason and unresolved questions",
                    type: "textarea",
                    required: true,
                  },
                ]}
                onSave={(v) =>
                  request("/scenarios/" + scenarioId + "/connections", "POST", {
                    ...v,
                    transferMovementId: v.transferMovementId || undefined,
                  })
                }
                onDone={detail.reload}
              />
            </section>
            <section className="panel">
              <ResearchForm
                title="Build rotation from approved links"
                fields={[
                  { name: "name", label: "Rotation name", required: true },
                  {
                    name: "physicalSetId",
                    label: "Physical stock identity (optional)",
                    type: "select",
                    options: [
                      { value: "", label: "Identity unknown" },
                      ...sets.map((s) => ({
                        value: s.id,
                        label: s.researchLabel,
                      })),
                    ],
                  },
                  {
                    name: "startDiagramId",
                    label: "Starting diagram",
                    type: "select",
                    required: true,
                    options: options.filter((o) =>
                      data.scenario.diagramIds.includes(o.value),
                    ),
                  },
                  {
                    name: "notes",
                    label: "Rotation research notes",
                    type: "textarea",
                    required: true,
                  },
                ]}
                onSave={(v) =>
                  request("/scenarios/" + scenarioId + "/rotations", "POST", {
                    ...v,
                    physicalSetId: v.physicalSetId || undefined,
                  })
                }
                onDone={detail.reload}
              />
            </section>
          </div>
          <section className="panel">
            <h2>Multi-day rotation diagrams</h2>
            {data.rotations.map((r: Row) => (
              <article key={r.id}>
                <h3>
                  {r.name} <span className="badge">{r.status}</span>
                </h3>
                <p>
                  {r.repeats
                    ? `Repeats every ${r.periodDays} days within the checked scenario`
                    : "Recurrence not established"}{" "}
                  ·{" "}
                  {r.periodDays
                    ? `Closed circuit length: ${r.periodDays} days`
                    : "Open sequence"}
                </p>
                <div className="rotation-flow">
                  {r.steps.map((s: Row, i: number) => {
                    const d = data.diagrams.find(
                      (d: Row) => d.id === s.diagramId,
                    );
                    return (
                      <React.Fragment key={i}>
                        <button
                          className="rotation-node"
                          onClick={() => onOpen(s.diagramId)}
                        >
                          <small>DAY {s.dayOffset + 1}</small>
                          <strong>Diagram {s.publishedNumber || "?"}</strong>
                          <span>
                            {d?.movements[0]?.origin?.name || "?"} →{" "}
                            {d?.movements.at(-1)?.destination?.name || "?"}
                          </span>
                        </button>
                        {i < r.steps.length - 1 && (
                          <span className="rotation-arrow">→</span>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {r.periodDays && <span>↻</span>}
                </div>
                <pre className="transcript">{r.notes}</pre>
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function StationAnalysis({
  stations,
  onOpen,
}: {
  stations: Row[];
  onOpen: (id: string) => void;
}) {
  const [station, setStation] = useState("");
  const result = useResearch(
    "/station-analysis/" + (station || "00000000-0000-4000-8000-000000000000"),
  );
  const data = station ? result.data : null;
  return (
    <>
      <section className="panel">
        <h2>Station-based connections</h2>
        <label>
          Research station
          <select
            aria-label="Research station"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          >
            <option value="">Choose station</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar">
          {stations
            .filter((s) =>
              ["York", "Scarborough", "Huttons Ambo"].includes(s.name),
            )
            .map((s) => (
              <button key={s.id} onClick={() => setStation(s.id)}>
                {s.name}
              </button>
            ))}
        </div>
      </section>
      {data && (
        <>
          <div className="grid">
            {[
              ["Finishing here", data.finishing],
              ["Starting here", data.starting],
            ].map(([label, items]: any) => (
              <section className="panel" key={label}>
                <h2>{label}</h2>
                {items.map((d: Row) => (
                  <article key={d.id}>
                    <button onClick={() => onOpen(d.id)}>
                      Diagram {d.publishedNumber || "?"}
                    </button>
                    <p>
                      {d.operatingDays.join(", ") || "Days unknown"} ·{" "}
                      {timeLabel(
                        label === "Finishing here"
                          ? d.movements.at(-1)?.arrivalMinutes
                          : d.movements[0]?.departureMinutes,
                      )}
                    </p>
                    <EvidenceLinks diagram={d} />
                  </article>
                ))}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Intermediate station workings</h2>
            {data.passing.map((d: Row) => (
              <button key={d.id} onClick={() => onOpen(d.id)}>
                Diagram {d.publishedNumber || "?"}
              </button>
            ))}
            <h2>Connections and unresolved stock movements</h2>
            {data.connections.map((l: Row) => (
              <article key={l.id}>
                <p>
                  <button onClick={() => onOpen(l.fromId)}>
                    {l.from.publishedNumber || "?"}
                  </button>{" "}
                  →{" "}
                  <button onClick={() => onOpen(l.toId)}>
                    {l.to.publishedNumber || "?"}
                  </button>{" "}
                  · {l.confidence} · {l.decision} · {l.kind}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function UnresolvedWorkspace({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const links = useResearch("/connections");
  return (
    <section className="panel">
      <h2>Unresolved connections</h2>
      {links.data
        ?.filter(
          (l: Row) =>
            l.decision === "Pending" ||
            l.kind === "Unresolved gap" ||
            l.confidence === "Conflict" ||
            l.confidence === "Unknown",
        )
        .map((l: Row) => (
          <ConnectionCard
            key={l.id}
            link={l}
            diagrams={[]}
            onDone={links.reload}
            onOpen={onOpen}
          />
        ))}
      {links.data?.length === 0 && <p>No connections analysed yet.</p>}
    </section>
  );
}
