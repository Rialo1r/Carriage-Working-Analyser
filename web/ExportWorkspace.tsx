import React, { useState } from "react";
import { request } from "./OcrWorkspace";
import { Row, useResearch } from "./ResearchUI";
export function ExportWorkspace({ diagrams }: { diagrams: Row[] }) {
  const [chosen, setChosen] = useState<string[]>([]),
    [verified, setVerified] = useState(true),
    [format, setFormat] = useState("JSON"),
    [preview, setPreview] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const history = useResearch("/exports");
  return (
    <>
      <p>
        Preview a frozen export before download. These files do not connect to
        or modify Railway Operations Manager.
      </p>
      <div className="grid">
        <section className="panel">
          <h2>Export selection</h2>
          <p>No boxes selected means all matching diagrams.</p>
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
              />
              Diagram {d.publishedNumber || "?"} · {d.status}
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            Verified / ready-for-export diagrams only
          </label>
          <label>
            Download format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option>JSON</option>
              <option>CSV</option>
            </select>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              request("/exports/preview", "POST", {
                format,
                verifiedOnly: verified,
                ...(chosen.length ? { diagramIds: chosen } : {}),
              })
                .then((p) => {
                  setPreview(p);
                  void history.reload();
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Preview export
          </button>
        </section>
        <section className="panel">
          <h2>Export history</h2>
          {history.data?.map((b: Row) => (
            <p key={b.id}>
              {b.format} · {new Date(b.createdAt).toLocaleString()} ·{" "}
              {b.warnings.length} warning(s){" "}
              <a className="button" href={"/api/exports/" + b.id + "/download"}>
                Download saved snapshot
              </a>
            </p>
          ))}
        </section>
      </div>
      {preview && (
        <section className="panel">
          <h2>Export preview</h2>
          <p>
            {preview.payload.diagrams.length} diagrams ·{" "}
            {preview.payload.rotations.length} rotations
          </p>
          {preview.warnings.map((w: string, i: number) => (
            <p className="conflict" key={i}>
              {w}
            </p>
          ))}
          <p className="muted">
            This snapshot preserves source references, verification, calendars,
            formations and unresolved information. CSV stores compound fields as
            quoted JSON; potentially active spreadsheet formulas are escaped.
          </p>
          <pre className="transcript export-preview">{preview.text}</pre>
          <a className="button primary" href={preview.downloadUrl}>
            Download exactly this preview
          </a>
        </section>
      )}
    </>
  );
}
