export const PROFILE_FIELDS = ["fullName", "firstName", "lastName", "email", "phone", "address", "city", "state", "postalCode", "country", "linkedin", "website"] as const;
export type AutofillProfile = Record<typeof PROFILE_FIELDS[number], string>;
export type AutofillResult = { filled: number; preserved: number; missing: number };

export function normalizeProfile(value: unknown): AutofillProfile {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(PROFILE_FIELDS.map((key) => [key,
    typeof source[key] === "string" ? source[key].trim().slice(0, 500) : "",
  ])) as AutofillProfile;
}

// Serialized by Chrome: keep all runtime helpers inside this function.
export function fillApplication(profile: AutofillProfile): AutofillResult {
  const result = { filled: 0, preserved: 0, missing: 0 };
  const normalize = (text: string) => text.replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\blinked in\b/g, "linkedin");
  const aliases: Record<string, keyof AutofillProfile> = {
    "name": "fullName", "full name": "fullName", "legal name": "fullName", "your name": "fullName",
    "first name": "firstName", "given name": "firstName", "last name": "lastName", "family name": "lastName", "surname": "lastName",
    "email": "email", "email address": "email", "e mail": "email", "e mail address": "email",
    "phone": "phone", "phone number": "phone", "mobile": "phone", "mobile phone": "phone", "mobile number": "phone", "telephone": "phone",
    "address": "address", "street address": "address", "address line 1": "address", "address 1": "address",
    "city": "city", "town": "city", "state": "state", "province": "state", "state province": "state",
    "zip": "postalCode", "zip code": "postalCode", "postal code": "postalCode", "zip postal code": "postalCode",
    "country": "country", "country region": "country",
    "linkedin": "linkedin", "linkedin url": "linkedin", "linkedin profile": "linkedin", "linkedin profile url": "linkedin",
    "website": "website", "personal website": "website", "portfolio": "website", "portfolio url": "website", "website url": "website",
  };
  const autocomplete: Record<string, keyof AutofillProfile> = {
    name: "fullName", "given-name": "firstName", "family-name": "lastName", email: "email", tel: "phone",
    "street-address": "address", "address-line1": "address", "address-level2": "city", "address-level1": "state",
    "postal-code": "postalCode", country: "country", "country-name": "country", url: "website",
  };
  const visible = (field: Element) => {
    for (let node: Element | null = field; node; node = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert") ||
        style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return field.getClientRects().length > 0;
  };
  const visit = (root: Document | ShadowRoot) => {
    for (const field of Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"))) {
      if (!visible(field) || field.matches(":disabled") || field.getAttribute("aria-disabled") === "true" ||
        ("readOnly" in field && field.readOnly) || field.getAttribute("role") === "combobox") continue;
      if (field instanceof HTMLInputElement && !["text", "email", "tel", "url"].includes(field.type)) continue;
      if (field instanceof HTMLSelectElement && field.multiple) continue;
      // Login and search forms are not application contact sections.
      if (field.closest('form')?.querySelector('input[type="password"], input[type="search"]')) continue;
      const labelledBy = (field.getAttribute("aria-labelledby") ?? "").split(/\s+/)
        .map((id) => root.getElementById(id)?.textContent ?? "").join(" ").trim();
      const labels = [labelledBy, field.getAttribute("aria-label") ?? "",
        ...Array.from(field.labels ?? []).map((label) => {
          const copy = label.cloneNode(true) as Element;
          copy.querySelectorAll("input, select, textarea").forEach((control) => control.remove());
          return copy.textContent ?? "";
        })].map((label) => label.trim()).filter(Boolean);
      const semantic = labels.length ? labels : [field.getAttribute("placeholder") ?? "", field.name, field.id].filter(Boolean);
      const clean = (text: string) => normalize(text.replace(/\((?:required|optional)\)|\b(?:required|optional)\b/gi, ""));
      // An explicit unfamiliar question must never be overridden by a generic name/autocomplete attribute.
      const candidates = semantic.map((text) => aliases[clean(text)]).filter(Boolean);
      let key = candidates[0];
      if (labels.length && (!key || candidates.some((candidate) => candidate !== key))) continue;
      if (!labels.length && !key) key = autocomplete[(field.autocomplete ?? "").split(/\s+/).at(-1) ?? ""];
      if (!key) continue;
      if (field.value.trim()) { result.preserved++; continue; }
      const value = profile[key];
      if (!value) { result.missing++; continue; }
      let next = value;
      if (field instanceof HTMLSelectElement) {
        const options = Array.from(field.options).filter((option) => option.value && !option.disabled &&
          !option.parentElement?.matches("optgroup:disabled") &&
          (normalize(option.value) === normalize(value) || normalize(option.textContent ?? "") === normalize(value)));
        if (options.length !== 1) { result.missing++; continue; }
        next = options[0].value;
      } else if (field.maxLength >= 0 && next.length > field.maxLength) { result.missing++; continue; }
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, next);
      field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      if (field.value === next) result.filled++;
      else result.missing++;
    }
    for (const node of Array.from(root.querySelectorAll("*"))) if (node.shadowRoot) visit(node.shadowRoot);
  };
  visit(document);
  return result;
}
