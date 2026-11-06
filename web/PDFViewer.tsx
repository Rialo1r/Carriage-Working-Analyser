import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export function PDFViewer({
  fileId,
  startPage = 1,
  rotation = 0,
  onCrop,
}: {
  fileId: string;
  startPage?: number;
  rotation?: number;
  onCrop?: (
    page: number,
    region: { x: number; y: number; width: number; height: number },
  ) => void;
}) {
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
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
        const viewport = p.getViewport({
          scale: zoom,
          rotation: (p.rotate + rotation) % 360,
        });
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
  }, [pdf, page, zoom, rotation]);
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
        <div
          style={{ position: "relative", width: "fit-content", margin: "auto" }}
        >
          <canvas
            ref={canvas}
            style={{ touchAction: onCrop ? "none" : undefined }}
            onPointerDown={(e) => {
              if (!onCrop) return;
              const r = e.currentTarget.getBoundingClientRect();
              drag.current = {
                x: (e.clientX - r.left) / r.width,
                y: (e.clientY - r.top) / r.height,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              setSelection(null);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.max(
                  0,
                  Math.min(1, (e.clientX - r.left) / r.width),
                ),
                y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
              setSelection({
                x: Math.min(x, drag.current.x),
                y: Math.min(y, drag.current.y),
                width: Math.abs(x - drag.current.x),
                height: Math.abs(y - drag.current.y),
              });
            }}
            onPointerUp={() => {
              if (
                selection &&
                selection.width > 0.005 &&
                selection.height > 0.005
              )
                onCrop?.(page, selection);
              drag.current = null;
            }}
          />
          {onCrop && selection && (
            <div
              style={{
                pointerEvents: "none",
                position: "absolute",
                left: `${selection.x * 100}%`,
                top: `${selection.y * 100}%`,
                width: `${selection.width * 100}%`,
                height: `${selection.height * 100}%`,
                border: "2px solid #bb7428",
                background: "#e9ae3630",
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
