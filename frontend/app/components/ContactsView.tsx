"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CONTACT_RELATIONSHIPS, CONTACT_RELATIONSHIP_LABELS, EMPTY_CONTACT_FORM } from "../lib/constants";
import type { Application, Contact, ContactFormValues } from "../lib/types";
import { AppIcon } from "./AppIcon";
import { ActiveFilterChips } from "./ActiveFilterChips";

type Props = {
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

export function ContactsView({ applications, contacts, createRequest, onSave, onRemove, onSummaryChange }: Props) {
    const [query, setQuery] = useState("");
    const [relationship, setRelationship] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(createRequest > 0);
    const [form, setForm] = useState<ContactFormValues>(EMPTY_CONTACT_FORM);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [isDetailMenuOpen, setIsDetailMenuOpen] = useState(false);
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const listScrollPosition = useRef(0);

    const filtered = useMemo(() => contacts.filter((contact) => {
        const haystack = [contact.name, contact.role, contact.email, contact.companyName, contact.applicationTitle].join(" ").toLowerCase();
        return (!query.trim() || haystack.includes(query.trim().toLowerCase())) && (!relationship || contact.relationship === relationship);
    }), [contacts, query, relationship]);
    const selected = contacts.find((contact) => contact.id === selectedId) ?? filtered[0] ?? null;

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
        setSelectedId(contactId);
        setIsDetailMenuOpen(false);
        setIsMobileDetailOpen(true);
        requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }
    function closeMobileDetail() {
        setIsMobileDetailOpen(false);
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
        {contacts.length === 0 ? <div className="panel contacts-empty"><span><AppIcon name="contacts" size={34} /></span><h2>Build your network</h2><p>Keep recruiters, referrals, hiring managers, and people you meet during your search in one place.</p><button className="primary" type="button" onClick={openCreate}><AppIcon name="plus" size={18} /> Add your first contact</button></div> :
        <div className={isMobileDetailOpen ? "applications-split-panel contacts-layout mobile-detail-open" : "applications-split-panel contacts-layout"}>
            <div className="application-list-panel contacts-list" aria-label="Contacts list">
                <div className={isFiltersOpen ? "applications-toolbar contacts-toolbar mobile-filters-open" : "applications-toolbar contacts-toolbar"} aria-label="Contact filters">
                    <label className="applications-search-field contacts-search"><AppIcon name="search" size={18} /><input aria-label="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, company, role, or email" /></label>
                    <button type="button" className="mobile-filter-toggle" aria-expanded={isFiltersOpen} onClick={() => setIsFiltersOpen((open) => !open)}><AppIcon name="filter" size={18} /> Filters{hasActiveFilters ? " (1)" : ""}</button>
                    <select aria-label="Filter contacts by relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}><option value="">All relationships</option>{CONTACT_RELATIONSHIPS.map((item) => <option key={item} value={item}>{CONTACT_RELATIONSHIP_LABELS[item]}</option>)}</select>
                    <button type="button" className="interviews-reset-button" disabled={!hasActiveFilters} onClick={() => { setQuery(""); setRelationship(""); }}><AppIcon name="history" size={15} /> Reset</button>
                </div>
                <ActiveFilterChips chips={relationship ? [{ id: "relationship", label: "Relationship", value: CONTACT_RELATIONSHIP_LABELS[relationship], onRemove: () => setRelationship("") }] : []} />
                {filtered.length ? filtered.map((contact) => <button key={contact.id} type="button" className={selected?.id === contact.id ? "contact-row active" : "contact-row"} onClick={() => openMobileDetail(contact.id)}>
                    <span className="contact-avatar">{initials(contact.name)}</span><span className="contact-row-copy"><strong>{contact.name}</strong><span>{contact.role || CONTACT_RELATIONSHIP_LABELS[contact.relationship]}</span><small>{contact.companyName || "No company linked"}</small></span><AppIcon name="arrow-right" size={17} />
                </button>) : <div className="contacts-no-results"><AppIcon name="search" size={26} /><strong>No contacts found</strong><span>Try a different search or filter.</span></div>}
            </div>
            <aside className="application-detail-panel contact-detail status-accent">
                {selected ? <>
                    <button type="button" className="mobile-detail-back" onClick={closeMobileDetail}><AppIcon name="arrow-left" size={20} /> Contacts</button>
                    <header className="contact-detail-header"><span className="contact-avatar large">{initials(selected.name)}</span><div><span className="contact-badge">{CONTACT_RELATIONSHIP_LABELS[selected.relationship]}</span><h2>{selected.name}</h2><p>{selected.role || "Role not set"}{selected.companyName ? ` at ${selected.companyName}` : ""}</p></div><div className="application-detail-header-actions"><button className="alternative icon-button" aria-label="Edit contact" onClick={() => openEdit(selected)}><AppIcon name="edit" size={20} /></button><div className="application-detail-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDetailMenuOpen(false); }}><button type="button" className="application-detail-menu-trigger" aria-label="More contact actions" aria-haspopup="menu" aria-expanded={isDetailMenuOpen} onClick={() => setIsDetailMenuOpen((open) => !open)}><AppIcon name="dots-vertical" size={25} /></button>{isDetailMenuOpen && <div className="application-detail-menu-popover" role="menu"><button type="button" role="menuitem" className="danger-text" onClick={async () => { setIsDetailMenuOpen(false); if (window.confirm(`Delete ${selected.name}?`)) { await onRemove(selected.id); setSelectedId(null); } }}><AppIcon name="trash" size={15} /> Delete contact</button></div>}</div></div></header>
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
        </div>}

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
