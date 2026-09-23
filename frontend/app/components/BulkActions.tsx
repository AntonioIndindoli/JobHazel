"use client";

import { useRef, useState, type ReactNode } from "react";
import { AppIcon } from "./AppIcon";

export type BulkChange = { field: string; value: string } | { field: "delete" };
export type BulkResult = { failed: { id: string; message: string }[]; warning?: string };
export type BulkHandler = (ids: string[], change: BulkChange) => Promise<BulkResult>;
export type BulkField = { key: string; label: string; options: { value: string; label: string }[] };

export function useBulkSelection(items: { id: string }[], scope: string) {
    const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope, ids: [] });
    if (selection.scope !== scope) setSelection({ scope, ids: [] });
    const ids = selection.scope === scope ? selection.ids.filter(id => items.some(item => item.id === id)) : [];
    const [busy, setBusy] = useState(false);
    function replace(next: string[]) { setSelection({ scope, ids: next }); }
    return {
        ids, busy, setBusy, replace,
        all: items.length > 0 && ids.length === items.length,
        toggle(id: string) { if (!busy) replace(ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]); },
        toggleAll() { if (!busy) replace(ids.length === items.length ? [] : items.map(item => item.id)); },
    };
}

type Selection = ReturnType<typeof useBulkSelection>;

export function BulkRow({ selection, id, label, children }: { selection: Selection; id: string; label: string; children: ReactNode }) {
    return <div className={`bulk-row${selection.ids.includes(id) ? " bulk-row-selected" : ""}`}>
        <label className="bulk-checkbox-target">
            <input type="checkbox" aria-label={`Select ${label}`} checked={selection.ids.includes(id)} disabled={selection.busy} onChange={() => selection.toggle(id)} />
        </label>
        {children}
    </div>;
}

export function BulkActions({ selection, count, noun, fields, onApply, deleteNote }: {
    selection: Selection; count: number; noun: string; fields: BulkField[]; onApply?: BulkHandler; deleteNote?: string;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [action, setAction] = useState("");
    const [value, setValue] = useState("");
    const [message, setMessage] = useState("");
    const [failures, setFailures] = useState<BulkResult["failed"]>([]);
    const locked = useRef(false);
    const field = fields.find(item => item.key === action);
    const entryNoun = selection.ids.length === 1 ? noun.replace(/s$/, "") : noun;
    if (!onApply) return null;

    async function apply() {
        if (locked.current || !onApply || !selection.ids.length) return;
        locked.current = true;
        selection.setBusy(true);
        const ids = [...selection.ids];
        try {
            const result = await onApply(ids, action === "delete" ? { field: "delete" } : { field: action, value });
            selection.replace(result.failed.map(item => item.id));
            setFailures(result.failed);
            setMessage(`${ids.length - result.failed.length} of ${ids.length} ${ids.length === 1 ? noun.replace(/s$/, "") : noun} ${action === "delete" ? "deleted" : "updated"}.${result.failed.length ? ` ${result.failed.length} failed and remain selected. Retry the action for those entries.` : ""}${result.warning ? ` ${result.warning}` : ""}`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "The action could not be completed. Refresh before retrying.");
        } finally {
            locked.current = false;
            selection.setBusy(false);
            dialog.current?.close();
        }
    }

    return <>
        <div className={`bulk-toolbar${selection.ids.length ? " has-selection" : ""}`} aria-label={`Bulk actions for ${noun}`} aria-busy={selection.busy}>
            <div className="bulk-selection-controls">
                <label className="bulk-select-all"><input type="checkbox" checked={selection.all} ref={node => { if (node) node.indeterminate = selection.ids.length > 0 && !selection.all; }} disabled={!count || selection.busy} onChange={selection.toggleAll} />Select all</label>
                {selection.ids.length > 0 && <div className="bulk-selection-summary">
                    <strong className="bulk-selection-count">{selection.ids.length} selected</strong>
                    <button type="button" className="bulk-clear-button" aria-label="Clear selection" title="Clear selection" disabled={selection.busy} onClick={() => selection.replace([])}><AppIcon name="x" size={15} /></button>
                </div>}
            </div>
            {selection.ids.length > 0 && <div className="bulk-toolbar-actions">
                <button type="button" className="bulk-action-button bulk-edit-button" disabled={selection.busy} onClick={() => { setAction(fields[0].key); setValue(""); dialog.current?.showModal(); }}><AppIcon name="edit" size={16} />Edit selected</button>
                <button type="button" className="bulk-action-button bulk-delete-button" disabled={selection.busy} onClick={() => { setAction("delete"); setValue(""); dialog.current?.showModal(); }}><AppIcon name="trash" size={16} />Delete</button>
            </div>}
        </div>
        {message && <div className="bulk-result" role="status">{message}{failures.length > 0 && <details><summary>Failed entries</summary><ul>{failures.map(item => <li key={item.id}>{item.message}</li>)}</ul></details>}</div>}
        <dialog ref={dialog} className="bulk-dialog" aria-labelledby={`bulk-title-${noun}`} onCancel={event => { if (selection.busy) event.preventDefault(); }}>
            <form onSubmit={event => { event.preventDefault(); void apply(); }}>
                <div className="bulk-dialog-header">
                    <h2 id={`bulk-title-${noun}`}>{action === "delete" ? "Delete" : "Edit"} {selection.ids.length} {entryNoun}</h2>
                    <p>{action === "delete" ? `This will permanently delete ${selection.ids.length === 1 ? "this entry" : "these entries"}. This action cannot be undone.` : "Choose the field and value to apply to your selection."}</p>
                </div>
                {action === "delete" ? <div className="bulk-dialog-body">{deleteNote && <p className="bulk-dialog-note">{deleteNote}</p>}</div> : <div className="bulk-dialog-body">
                    <label className="bulk-dialog-field"><span>Field to change</span><select disabled={selection.busy} value={action} onChange={event => { setAction(event.target.value); setValue(""); }}>{fields.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
                    <label className="bulk-dialog-field"><span>New {field?.label.toLowerCase()}</span><select required disabled={selection.busy} value={value} onChange={event => setValue(event.target.value)}><option value="">Choose a value</option>{field?.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <p className="bulk-dialog-hint">All other fields stay unchanged.</p>
                </div>}
                <div className="bulk-dialog-actions"><button type="button" className="secondary" disabled={selection.busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className={action === "delete" ? "bulk-dialog-delete" : "primary"} disabled={selection.busy || !selection.ids.length || (action !== "delete" && !value)}>{selection.busy ? "Applying…" : `${action === "delete" ? "Delete" : "Update"} ${selection.ids.length} ${entryNoun}`}</button></div>
            </form>
        </dialog>
    </>;
}
