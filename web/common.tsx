import React, { useEffect, useRef, useState } from "react";
export type Row = Record<string, any>;
export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export async function api(url: string, method = "GET", body?: unknown) {
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
export const dayLabel = (values: number[]) =>
  values.length === 7
    ? "Daily"
    : values.length
      ? values.map((d) => days[d].slice(0, 3)).join(", ")
      : "Days not entered";
export const dateLabel = (date: string) =>
  new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const timeLabel = (minutes: number | null, offset = 0) =>
  minutes == null
    ? "Unknown"
    : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}${offset ? ` (+${offset}d)` : ""}`;
export const parseTime = (s: string) => {
  if (!s) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
    throw new Error(
      "Enter times as HH:MM from 00:00 to 23:59, and record the day offset separately.",
    );
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
export const formValues = (f: HTMLFormElement) =>
  Object.fromEntries(new FormData(f));
export function Input({
  label,
  name,
  value = "",
  type = "text",
  required = false,
  ...props
}: any) {
  return (
    <label className="field">
      {label}
      <input
        aria-label={label}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        {...props}
      />
    </label>
  );
}
export function Text({ label, name, value = "", required = false }: any) {
  return (
    <label className="field">
      {label}
      <textarea
        aria-label={label}
        name={name}
        defaultValue={value ?? ""}
        required={required}
      />
    </label>
  );
}
export function DayPicker({
  value,
  onChange,
  label = "Operating days",
}: {
  value: number[];
  onChange: (v: number[]) => void;
  label?: string;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="day-picker">
        {days.map((day, n) => (
          <label key={n}>
            <input
              type="checkbox"
              checked={value.includes(n)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, n].sort()
                    : value.filter((d) => d !== n),
                )
              }
            />
            {day}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  empty = "Unknown / not selected",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
  empty?: string;
}) {
  const [search, setSearch] = useState("");
  const shown = options.filter(
    (o) =>
      o.id === value || o.label.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="search-select">
      <label>
        {label}
        <input
          aria-label={label + " search"}
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        >
          <option value="">{empty}</option>
          {shown.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {search && (
        <small>{shown.length} option(s). Select a record explicitly.</small>
      )}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog?.addEventListener("cancel", cancel);
    return () => dialog?.removeEventListener("cancel", cancel);
  }, []);
  return (
    <dialog ref={ref} aria-label={title}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SaveForm({
  children,
  onSave,
  title = "Save",
  className = "",
}: {
  children: React.ReactNode;
  onSave: (form: HTMLFormElement) => Promise<void>;
  title?: string;
  className?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        setSaved(false);
        onSave(form)
          .then(() => setSaved(true))
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
      }}
    >
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="success" role="status">
          Saved.
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : title}
      </button>
    </form>
  );
}
export const workingLabel = (w: Row) =>
  `${w.diagram.number} · ${w.label || dayLabel(w.calendar?.weekdays || [])} · ${w.startStation?.name || "?"} → ${w.finishStation?.name || "?"} · ${w.diagram.period.name}`;
export function CatalogDialog({
  kind,
  onClose,
  onCreated,
}: {
  kind: "stations" | "types";
  onClose: () => void;
  onCreated: (row: Row) => Promise<void>;
}) {
  return (
    <Modal
      title={kind === "stations" ? "Add Station" : "Add Carriage Type"}
      onClose={onClose}
    >
      <SaveForm
        title={kind === "stations" ? "Save station" : "Save carriage type"}
        onSave={async (f) => {
          const row = await api("/" + kind, "POST", formValues(f));
          await onCreated(row);
          onClose();
        }}
      >
        <Input
          label={kind === "stations" ? "Station name" : "Carriage type name"}
          name="name"
          required
        />
        {kind === "types" && <Input label="Type code (optional)" name="code" />}
        <Text label="Notes" name="notes" />
      </SaveForm>
    </Modal>
  );
}

export function readableResearch(value: any): any {
  if (Array.isArray(value)) return value.map(readableResearch);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k, v]) =>
            k !== "id" &&
            !k.endsWith("Id") &&
            k !== "exclusiveKey" &&
            !(typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(v)),
        )
        .map(([k, v]) => [k, readableResearch(v)]),
    );
  return value;
}
