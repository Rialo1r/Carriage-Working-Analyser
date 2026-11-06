import React, { useEffect, useState } from "react";
import { PDFViewer } from "./PDFViewer";
export async function request(url: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
type Row = Record<string, any>;
export function OcrWorkspace({
  documents,
  onOpen,
}: {
  documents: Row[];
  onOpen: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<Row[]>([]),
    [rules, setRules] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [pageId, setPageId] = useState(""),
    [rotation, setRotation] = useState(0),
    [layout, setLayout] = useState(6),
    [region, setRegion] = useState<any>(null),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [suggestions, setSuggestions] = useState<Row[]>([]),
    [search, setSearch] = useState(""),
    [results, setResults] = useState<Row[]>([]);
  const pages = documents.flatMap((d) =>
    d.files.flatMap((f: any) =>
      f.pages.map((p: any) => ({ ...p, fileId: f.id, title: d.title })),
    ),
  );
  const page = pages.find((p) => p.id === pageId);
  async function refresh() {
    setJobs(await request("/ocr"));
    setRules(await request("/correction-rules"));
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, []);
  async function act(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function select(j: Row) {
    setSelected(j);
    setText(j.revisions[0]?.text ?? j.rawText ?? "");
    setSuggestions(await request("/ocr/" + j.id + "/suggestions"));
  }
  return (
    <>
      <p>
        Choose a source page, optionally rotate it and drag a crop around the
        table or entry you want to read. OCR is a draft, never verified
        historical evidence.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="grid">
        <section className="panel">
          <h2>Selected-page OCR</h2>
          <label>
            Source PDF page
            <select
              aria-label="OCR source page"
              value={pageId}
              onChange={(e) => {
                setPageId(e.target.value);
                setRegion(null);
              }}
            >
              <option value="">Choose a page</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · PDF {p.pdfPage}
                </option>
              ))}
            </select>
          </label>
          <div className="grid">
            <label>
              Rotate for reading
              <select
                value={rotation}
                onChange={(e) => {
                  setRotation(Number(e.target.value));
                  setRegion(null);
                }}
              >
                {[0, 90, 180, 270].map((n) => (
                  <option key={n} value={n}>
                    {n}° clockwise
                  </option>
                ))}
              </select>
            </label>
            <label>
              Layout
              <select
                value={layout}
                onChange={(e) => setLayout(Number(e.target.value))}
              >
                <option value={3}>Automatic columns</option>
                <option value={4}>Single column</option>
                <option value={6}>One table / text block</option>
                <option value={11}>Sparse text</option>
              </select>
            </label>
          </div>
          <p>
            {region
              ? "Selected crop: " +
                Object.values(region)
                  .map((n: any) => Math.round(n * 100) + "%")
                  .join(", ")
              : "Whole selected page; no crop selected."}
          </p>
          <button onClick={() => setRegion(null)}>Clear crop</button>
          <button
            className="primary"
            disabled={!pageId}
            onClick={() =>
              void act(async () => {
                await request("/ocr", "POST", {
                  pageId,
                  rotation,
                  layout,
                  ...(region ? { region } : {}),
                });
              })
            }
          >
            Queue OCR
          </button>
        </section>
        <section className="panel">
          <h2>Search transcriptions</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () =>
                setResults(
                  await request(
                    "/source-search?q=" + encodeURIComponent(search),
                  ),
                ),
              );
            }}
          >
            <label>
              Station, train or diagram reference
              <input
                minLength={2}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                required
              />
            </label>
            <button>Search original and corrected text</button>
          </form>
          {results.map((j) => (
            <p key={j.id}>
              <button onClick={() => void act(() => select(j))}>
                {j.page.file.document.title} · page {j.page.pdfPage}
              </button>
            </p>
          ))}
        </section>
      </div>
      {page && (
        <PDFViewer
          key={page.id}
          fileId={page.fileId}
          startPage={page.pdfPage}
          rotation={rotation}
          onCrop={(n, r) => {
            const p = pages.find(
              (p) => p.fileId === page.fileId && p.pdfPage === n,
            );
            if (p) {
              setPageId(p.id);
              setRegion(r);
            }
          }}
        />
      )}
      <div className="grid">
        <section className="panel">
          <h2>OCR jobs</h2>
          {!jobs.length && <p>No OCR jobs yet.</p>}
          {jobs.map((j) => (
            <article key={j.id}>
              <strong>
                {j.page.file.document.title} · PDF {j.page.pdfPage}
              </strong>
              <p>
                {j.status} · confidence{" "}
                {j.confidence == null
                  ? "unknown"
                  : j.confidence.toFixed(1) + "%"}
                {j.revisions.length > 0 &&
                  ` · ${j.revisions.length} manual revision(s)`}
              </p>
              {j.error && <p className="error">{j.error}</p>}
              <button
                disabled={j.status !== "Completed"}
                onClick={() => void act(() => select(j))}
              >
                Review transcription
              </button>
              <button
                onClick={() =>
                  void act(async () => {
                    await request("/ocr", "POST", {
                      pageId: j.pageId,
                      rotation: j.rotation,
                      layout: j.layout,
                      ...(j.region ? { region: j.region } : {}),
                    });
                  })
                }
              >
                Rerun as new job
              </button>
            </article>
          ))}
        </section>
        <section className="panel">
          <h2>Correction rules</h2>
          <p>Rules offer suggestions. They never silently replace evidence.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget,
                v = Object.fromEntries(new FormData(f));
              void act(async () => {
                await request("/correction-rules", "POST", v);
                f.reset();
              });
            }}
          >
            <label>
              Recognised text
              <input name="original" required />
            </label>
            <label>
              Suggested correction
              <input name="replacement" required />
            </label>
            <label>
              Reason
              <input name="notes" />
            </label>
            <button>Add correction rule</button>
          </form>
          {rules.map((r) => (
            <p key={r.id}>
              {r.original} → {r.replacement}{" "}
              <button
                onClick={() =>
                  void act(async () => {
                    await request("/correction-rules/" + r.id, "PATCH", {
                      enabled: !r.enabled,
                    });
                  })
                }
              >
                {r.enabled ? "Disable" : "Enable"}
              </button>
            </p>
          ))}
        </section>
      </div>
      {selected && (
        <section className="panel">
          <h2>Review OCR · PDF {selected.page.pdfPage}</h2>
          <a
            href={
              "/api/files/" +
              selected.page.fileId +
              "#page=" +
              selected.page.pdfPage
            }
            target="_blank"
            rel="noreferrer"
          >
            Open original PDF page
          </a>
          <div className="grid">
            <div>
              <img
                className="source-crop"
                src={"/api/ocr/" + selected.id + "/image"}
                alt="Rendered source page or selected crop"
              />
              <details>
                <summary>Recognised words, columns and confidence</summary>
                <p>
                  Positions refer to the rendered crop. Use these recognition
                  blocks to inspect table columns; reading order and inferred
                  rows still require manual verification.
                </p>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Word</th>
                        <th>Left / top</th>
                        <th>Width / height</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.blocks || []).map((b: Row, i: number) => (
                        <tr key={i}>
                          <td>{b.text}</td>
                          <td>
                            {b.left} / {b.top}
                          </td>
                          <td>
                            {b.width} / {b.height}
                          </td>
                          <td className={b.confidence < 80 ? "conflict" : ""}>
                            {b.confidence.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <h3>Original OCR — retained unchanged</h3>
              <pre className="transcript">{selected.rawText}</pre>
            </div>
            <div>
              <label>
                Corrected transcription
                <textarea
                  className="large"
                  aria-label="Corrected transcription"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              {suggestions.map((s) => (
                <p key={s.ruleId}>
                  {s.original} → {s.replacement}
                  <button
                    onClick={() =>
                      setText((t) => t.split(s.original).join(s.replacement))
                    }
                  >
                    Apply suggestion to draft
                  </button>
                  <button
                    onClick={() =>
                      setSuggestions((x) =>
                        x.filter((r) => r.ruleId !== s.ruleId),
                      )
                    }
                  >
                    Reject suggestion
                  </button>
                </p>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  void act(async () => {
                    await request(
                      "/ocr/" + selected.id + "/revisions",
                      "POST",
                      { text, notes: new FormData(f).get("notes") },
                    );
                    await select(
                      (await request("/ocr")).find(
                        (j: any) => j.id === selected.id,
                      ),
                    );
                  });
                }}
              >
                <label>
                  Reason for revision
                  <input name="notes" required />
                </label>
                <button className="primary">
                  Save new transcription revision
                </button>
              </form>
              <h3>Extract only a selected working</h3>
              <p>
                Select relevant text in the transcription and retain only that
                text below before creating a draft working. No train/diagram
                number is inferred.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Object.fromEntries(new FormData(e.currentTarget));
                  void act(async () => {
                    const d = await request(
                      "/ocr/" + selected.id + "/extract",
                      "POST",
                      {
                        ...v,
                        originalText: selected.rawText.slice(0, 20000),
                        transcription: text.slice(0, 20000),
                      },
                    );
                    onOpen(d.id);
                  });
                }}
              >
                <label>
                  Published diagram number (if known)
                  <input name="publishedNumber" />
                </label>
                <label>
                  Research title
                  <input name="title" />
                </label>
                <label>
                  Interpretation notes
                  <input name="notes" required />
                </label>
                <button>Create source-linked draft diagram</button>
              </form>
              <details>
                <summary>Earlier manual revisions</summary>
                {selected.revisions.map((r: any) => (
                  <article key={r.id}>
                    <p>
                      {r.notes} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                    <pre className="transcript">{r.text}</pre>
                  </article>
                ))}
              </details>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
