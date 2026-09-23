"use client";

import { BulkActions, BulkRow, useBulkSelection, type BulkHandler } from "./BulkActions";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CONTACT_RELATIONSHIPS, CONTACT_RELATIONSHIP_LABELS, EMPTY_CONTACT_FORM } from "../lib/constants";
import type { Application, Contact, ContactFormValues } from "../lib/types";
import { AppIcon } from "./AppIcon";
import { CollectionListControls } from "./CollectionListControls";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { CollectionPaneCollapse, CollectionPaneDivider } from "./CollectionPaneControls";
import { useCollectionDetailPane } from "./useCollectionDetailPane";

type Props = {
    onBulkApply?: BulkHandler;
    applications: Application[];
    contacts: Contact[];
    createRequest: number;
    onSave: (values: ContactFormValues, id?: string) => Promise<{ ok: boolean; message?: string }>;
    onRemove: (id: string) => Promise<void>;
    onSummaryChange?: (summary: { hasActiveFilters: boolean; shown: number }) => void;
};

function initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function ContactsView({ applications, contacts, createRequest, onSave, onRemove, onSummaryChange, onBulkApply }: Props) {
    const [query, setQuery] = useState("");
    const [relationship, setRelationship] = useState("");
    const {
        containerRef: setSplitPaneNode,
        selectedId: selectedContactId,
        isOpen: isDetailPaneOpen,
        isDragging: isResizingDetailPane,
        select: selectContact,
        collapse: collapseDetailPane,
        beginResize,
        resizeWithKeyboard,
        splitStyle,
    } = useCollectionDetailPane("jobhazel-contacts-detail-pane");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(createRequest > 0);
    const [form, setForm] = useState<ContactFormValues>(EMPTY_CONTACT_FORM);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [isDetailMenuOpen, setIsDetailMenuOpen] = useState(false);
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [sortKey, setSortKey] = useState<"name" | "companyName" | "relationship" | "updatedAt">("name");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const listScrollPosition = useRef(0);

    const filtered = useMemo(() => contacts.filter((contact) => {
        const haystack = [contact.name, contact.role, contact.email, contact.companyName, contact.applicationTitle].join(" ").toLowerCase();
        return (!query.trim() || haystack.includes(query.trim().toLowerCase())) && (!relationship || contact.relationship === relationship);
    }), [contacts, query, relationship]);
    const sortedContacts = useMemo(() => [...filtered].sort((left, right) => {
        const leftValue = sortKey === "relationship" ? CONTACT_RELATIONSHIP_LABELS[left.relationship] : left[sortKey] ?? "";
        const rightValue = sortKey === "relationship" ? CONTACT_RELATIONSHIP_LABELS[right.relationship] : right[sortKey] ?? "";
        return String(leftValue).localeCompare(String(rightValue)) * (sortDirection === "asc" ? 1 : -1);
    }), [filtered, sortKey, sortDirection]);
    const bulk = useBulkSelection(sortedContacts, JSON.stringify([query, relationship]));
    const selected = contacts.find((contact) => contact.id === selectedContactId) ?? null;

    function openCreate() {
        setEditingId(null); setForm({ ...EMPTY_CONTACT_FORM }); setError(""); setIsFormOpen(true);
    }
    function openEdit(contact: Contact) {
        setEditingId(contact.id);
        setForm({ name: contact.name, role: contact.role ?? "", email: contact.email ?? "", linkedinUrl: contact.linkedinUrl ?? "", relationship: contact.relationship, notes: contact.notes ?? "", companyName: contact.companyName ?? "", applicationId: contact.applicationId ?? "" });
        setError(""); setIsFormOpen(true);
    }
    function openMobileDetail(contactId: string) {
        listScrollPosition.current = window.scrollY;
        selectContact(contactId);
        setIsDetailMenuOpen(false);
        const shouldUseMobileDetail = window.matchMedia?.("(max-width: 900px)").matches ?? false;
        setIsMobileDetailOpen(shouldUseMobileDetail);
        if (shouldUseMobileDetail) requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }
    function closeMobileDetail() {
        setIsMobileDetailOpen(false);
        collapseDetailPane();
        requestAnimationFrame(() => window.scrollTo({ top: listScrollPosition.current, behavior: "auto" }));
    }
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!form.name.trim()) return setError("Name is required.");
        setSaving(true); setError("");
        const result = await onSave(form, editingId ?? undefined);
        setSaving(false);
        if (!result.ok) return setError(result.message ?? "Contact could not be saved.");
        setIsFormOpen(false);
    }

    const hasActiveFilters = Boolean(query.trim() || relationship);

    useEffect(() => {
        onSummaryChange?.({ hasActiveFilters, shown: filtered.length });
    }, [filtered.length, hasActiveFilters, onSummaryChange]);

    return <section className={isMobileDetailOpen ? "applications-page contacts-page mobile-page-detail-open" : "applications-page contacts-page"}>
        <div
            ref={setSplitPaneNode}
            style={splitStyle}
            className={`applications-split-panel contacts-layout${selected && isDetailPaneOpen ? " detail-pane-open" : ""}${isMobileDetailOpen ? " mobile-detail-open" : ""}${isResizingDetailPane ? " is-resizing" : ""}`}
        >
            <div className="application-list-panel contacts-list" aria-label="Contacts list">
                <CollectionListControls
                    noun="contacts"
                    search={<label className="applications-search-field contacts-search"><AppIcon name="search" size={18} /><input aria-label="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, company, role, or email" /></label>}
                    filters={<select aria-label="Filter contacts by relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}><option value="">All relationships</option>{CONTACT_RELATIONSHIPS.map((item) => <option key={item} value={item}>{CONTACT_RELATIONSHIP_LABELS[item]}</option>)}</select>}
                    filtersOpen={isFiltersOpen}
                    onToggleFilters={() => setIsFiltersOpen(open => !open)}
                    activeFilterCount={Number(Boolean(relationship))}
                    hasActiveFilters={hasActiveFilters}
                    onReset={() => { setQuery(""); setRelationship(""); }}
                    sortValue={`${sortKey}:${sortDirection}`}
                    sortOptions={[{ value: "name:asc", label: "Name: A to Z" }, { value: "name:desc", label: "Name: Z to A" }, { value: "companyName:asc", label: "Company: A to Z" }, { value: "companyName:desc", label: "Company: Z to A" }, { value: "relationship:asc", label: "Relationship: A to Z" }, { value: "relationship:desc", label: "Relationship: Z to A" }, { value: "updatedAt:desc", label: "Recently updated" }, { value: "updatedAt:asc", label: "Least recently updated" }]}
                    onSortChange={value => { const [key, direction] = value.split(":"); setSortKey(key as typeof sortKey); setSortDirection(direction as typeof sortDirection); }}
                />
                <ActiveFilterChips chips={relationship ? [{ id: "relationship", label: "Relationship", value: CONTACT_RELATIONSHIP_LABELS[relationship], onRemove: () => setRelationship("") }] : []} />
                    <BulkActions selection={bulk} count={sortedContacts.length} noun="contacts" onApply={onBulkApply} fields={[{ key: "relationship", label: "Relationship", options: CONTACT_RELATIONSHIPS.map(relationship => ({ value: relationship, label: CONTACT_RELATIONSHIP_LABELS[relationship] })) }]} />
                {sortedContacts.length ? sortedContacts.map((contact) => <BulkRow key={contact.id} selection={bulk} id={contact.id} label={contact.name}><button type="button" className={selected?.id === contact.id ? "contact-row active" : "contact-row"} onClick={() => openMobileDetail(contact.id)}>
                    <span className="contact-avatar">{initials(contact.name)}</span><span className="contact-row-copy"><strong>{contact.name}</strong><span>{contact.role || CONTACT_RELATIONSHIP_LABELS[contact.relationship]}</span><small>{contact.companyName || "No company linked"}</small></span><AppIcon name="arrow-right" size={17} />
                </button></BulkRow>) : (
                    <div className="applications-empty application-list-empty">
                        <span className="empty-illustration">
                            <AppIcon name="contacts" size={31} />
                        </span>
                        <h2>{contacts.length === 0 ? "No contacts yet" : "No contacts match these filters"}</h2>
                        <p>{contacts.length === 0
                            ? "Add a contact to keep track of your network."
                            : "Clear filters or adjust the search terms to expand the list."}</p>
                        <button type="button" className="secondary" onClick={openCreate}>
                            <AppIcon name="plus" size={18} />
                            Add Contact
                        </button>
                    </div>
                )}
            </div>
            {selected && isDetailPaneOpen && <CollectionPaneDivider onResizeStart={beginResize} onResizeBy={resizeWithKeyboard} />}
            <aside className="application-detail-panel contact-detail status-accent">
                {selected ? <>
                    <button type="button" className="mobile-detail-back" onClick={closeMobileDetail}><AppIcon name="arrow-left" size={20} /> Contacts</button>
                    <CollectionPaneCollapse label="contact" onCollapse={() => { collapseDetailPane(); setIsMobileDetailOpen(false); }} />
                    <header className="contact-detail-header"><span className="contact-avatar large">{initials(selected.name)}</span><div><span className="contact-badge">{CONTACT_RELATIONSHIP_LABELS[selected.relationship]}</span><h2>{selected.name}</h2><p>{selected.role || "Role not set"}{selected.companyName ? ` at ${selected.companyName}` : ""}</p></div><div className="application-detail-header-actions"><button className="alternative icon-button" aria-label="Edit contact" onClick={() => openEdit(selected)}><AppIcon name="edit" size={20} /></button><div className="application-detail-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDetailMenuOpen(false); }}><button type="button" className="application-detail-menu-trigger" aria-label="More contact actions" aria-haspopup="menu" aria-expanded={isDetailMenuOpen} onClick={() => setIsDetailMenuOpen((open) => !open)}><AppIcon name="dots-vertical" size={25} /></button>{isDetailMenuOpen && <div className="application-detail-menu-popover" role="menu"><button type="button" role="menuitem" className="danger-text" onClick={async () => { setIsDetailMenuOpen(false); if (window.confirm(`Delete ${selected.name}?`)) { await onRemove(selected.id); collapseDetailPane(); } }}><AppIcon name="trash" size={15} /> Delete contact</button></div>}</div></div></header>
                    <dl className="contact-facts">
                        <div><dt>Email</dt><dd>{selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : <span>Not added</span>}</dd></div>
                        <div><dt>LinkedIn</dt><dd>{selected.linkedinUrl ? <a href={selected.linkedinUrl} target="_blank" rel="noreferrer">View profile <AppIcon name="external-link" size={14} /></a> : <span>Not added</span>}</dd></div>
                        <div><dt>Application</dt><dd>{selected.applicationTitle || "Not linked"}</dd></div>
                    </dl>
                    <section className="contact-notes">
                        <div className="contact-notes-heading">
                            <h3>Notes</h3>
                            <button type="button" className="alternative application-section-action" onClick={() => openEdit(selected)}>Edit notes</button>
                        </div>
                        <p className={selected.notes ? "" : "muted is-empty"}>
                            {!selected.notes && <AppIcon name="document" size={22} />}
                            {selected.notes || "No notes added yet."}
                        </p>
                    </section>
                </> : <div className="contacts-no-results"><AppIcon name="contacts" size={30} /><strong>Select a contact</strong></div>}
            </aside>
        </div>

        {isFormOpen && <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsFormOpen(false); }}><aside className="drawer contact-drawer" role="dialog" aria-modal="true" aria-labelledby="contact-form-title">
            <header className="drawer-header"><div><span className="eyebrow">Network</span><h2 id="contact-form-title">{editingId ? "Edit contact" : "Add contact"}</h2></div><button type="button" className="drawer-close" aria-label="Close" onClick={() => setIsFormOpen(false)}><AppIcon name="x" size={21} /></button></header>
            <form onSubmit={submit} className="drawer-form"><div className="form-grid">
                <label className="field full"><span>Name *</span><input autoFocus value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} placeholder="e.g. Maya Chen" /></label>
                <label className="field"><span>Role</span><input value={form.role} onChange={(e) => setForm({...form, role:e.target.value})} placeholder="Senior recruiter" /></label>
                <label className="field"><span>Relationship</span><select value={form.relationship} onChange={(e) => setForm({...form, relationship:e.target.value})}>{CONTACT_RELATIONSHIPS.map((item) => <option key={item} value={item}>{CONTACT_RELATIONSHIP_LABELS[item]}</option>)}</select></label>
                <label className="field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({...form, email:e.target.value})} placeholder="maya@company.com" /></label>
                <label className="field"><span>LinkedIn URL</span><input type="url" value={form.linkedinUrl} onChange={(e) => setForm({...form, linkedinUrl:e.target.value})} placeholder="https://linkedin.com/in/..." /></label>
                <label className="field"><span>Company</span><input value={form.companyName} onChange={(e) => setForm({...form, companyName:e.target.value})} placeholder="Company name" /></label>
                <label className="field"><span>Application</span><select value={form.applicationId} onChange={(e) => { const app=applications.find(a=>a.id===e.target.value); setForm({...form, applicationId:e.target.value, companyName:app?.companyName ?? form.companyName}); }}><option value="">Not linked</option>{applications.map((app) => <option key={app.id} value={app.id}>{app.title} · {app.companyName || "Unknown company"}</option>)}</select></label>
                <label className="field full"><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({...form, notes:e.target.value})} placeholder="How you met, follow-up context, or useful details…" /></label>
            </div>{error && <p className="form-message error">{error}</p>}<footer className="drawer-actions"><button type="button" className="secondary" onClick={() => setIsFormOpen(false)}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add contact"}</button></footer></form>
        </aside></div>}
    </section>;
}
