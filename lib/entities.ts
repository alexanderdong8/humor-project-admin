/**
 * The lists Backstage manages with plain create / read / update / delete.
 * Each entry names its table and fields; the same spec drives the form (in
 * components/crud-manager.tsx) and the server-side validation (here). Writes
 * go straight to the table with the admin's session, so RLS ("Superadmins
 * write", supabase/pipeline.sql) is the final check.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "checkbox"
  | "select"
  | "email"
  | "domain"
  | "url"
  | "envvar"
  | "slug"
  | "modelId";

export type FieldSpec = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  step?: number;
  placeholder?: string;
  help?: string;
  /** For selects. An empty value means "none" (stored as null). */
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  wide?: boolean;
};

export type EntityKey = "terms" | "examples" | "providers" | "models" | "domains" | "emails";

export type EntitySpec = {
  table: string;
  singular: string;
  plural: string;
  /** Pages to refresh after a change. */
  paths: string[];
  fields: FieldSpec[];
};

export const ENTITIES: Record<EntityKey, EntitySpec> = {
  terms: {
    table: "terms",
    singular: "term",
    plural: "terms",
    paths: ["/terms", "/chains"],
    fields: [
      { name: "term", label: "Term", type: "text", required: true, max: 60, placeholder: "e.g. Butler" },
      {
        name: "definition",
        label: "What it means",
        type: "textarea",
        required: true,
        max: 300,
        wide: true,
        placeholder: "Butler Library, where people camp out for entire finals seasons.",
      },
      { name: "is_active", label: "Use in caption prompts", type: "checkbox", defaultValue: true },
    ],
  },
  examples: {
    table: "generation_examples",
    singular: "example",
    plural: "examples",
    paths: ["/examples", "/chains"],
    fields: [
      { name: "chain_id", label: "Caption style", type: "select", options: [], help: "Leave on “Every style” to use it for all four." },
      { name: "caption", label: "Example caption", type: "textarea", required: true, max: 200, wide: true },
      { name: "notes", label: "Notes", type: "text", max: 300, placeholder: "Why it's a good example (optional)" },
      { name: "is_active", label: "Use in caption prompts", type: "checkbox", defaultValue: true },
    ],
  },
  providers: {
    table: "llm_providers",
    singular: "provider",
    plural: "providers",
    paths: ["/providers", "/models"],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80, placeholder: "Google AI Studio (Gemini)" },
      { name: "slug", label: "Slug", type: "slug", required: true, max: 40, placeholder: "google", help: "Lowercase letters, numbers, dashes. The code calls providers by slug." },
      { name: "api_base_url", label: "API base URL", type: "url", max: 200, placeholder: "https://generativelanguage.googleapis.com" },
      { name: "api_key_env", label: "API key environment variable", type: "envvar", max: 64, placeholder: "GEMINI_API_KEY", help: "The name of the variable only. Keys never go in the database." },
      { name: "notes", label: "Notes", type: "textarea", max: 500, wide: true },
      { name: "is_active", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  models: {
    table: "llm_models",
    singular: "model",
    plural: "models",
    paths: ["/models", "/providers", "/chains"],
    fields: [
      { name: "provider_id", label: "Provider", type: "select", required: true, options: [] },
      { name: "name", label: "Display name", type: "text", required: true, max: 80, placeholder: "Gemini 3.5 Flash" },
      { name: "api_model_id", label: "API model ID", type: "modelId", required: true, max: 100, placeholder: "gemini-3.5-flash" },
      { name: "priority", label: "Fallback order", type: "number", required: true, min: 0, max: 1000, step: 1, defaultValue: 10, help: "Lower runs first. The writer moves down the list when a model is busy." },
      { name: "temperature", label: "Temperature", type: "number", required: true, min: 0, max: 2, step: 0.05, defaultValue: 1 },
      { name: "supports_images", label: "Accepts images (required for captions)", type: "checkbox", defaultValue: true },
      { name: "is_active", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  domains: {
    table: "allowed_signup_domains",
    singular: "domain",
    plural: "domains",
    paths: ["/access/domains"],
    fields: [
      { name: "domain", label: "Domain", type: "domain", required: true, max: 120, placeholder: "columbia.edu", help: "Subdomains count too: cs.columbia.edu is covered by columbia.edu." },
      { name: "note", label: "Note", type: "text", max: 200, placeholder: "Who this is for (optional)" },
    ],
  },
  emails: {
    table: "whitelisted_emails",
    singular: "email address",
    plural: "email addresses",
    paths: ["/access/emails"],
    fields: [
      { name: "email", label: "Email address", type: "email", required: true, max: 200, placeholder: "guest@example.com" },
      { name: "note", label: "Note", type: "text", max: 200, placeholder: "Who this is (optional)" },
    ],
  },
};

export function isEntityKey(value: unknown): value is EntityKey {
  return typeof value === "string" && value in ENTITIES;
}

const PATTERNS: Partial<Record<FieldType, { re: RegExp; message: string }>> = {
  email: { re: /^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/, message: "isn't a valid email address" },
  domain: { re: /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/, message: "should look like columbia.edu" },
  url: { re: /^https:\/\/[^\s]+$/, message: "must start with https://" },
  envvar: { re: /^[A-Z][A-Z0-9_]{1,63}$/, message: "should look like GEMINI_API_KEY" },
  slug: { re: /^[a-z0-9-]{2,40}$/, message: "can only use lowercase letters, numbers, and dashes" },
  modelId: { re: /^[A-Za-z0-9._:/-]{2,100}$/, message: "has characters a model ID can't contain" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turns a submitted form into a row, or explains what's wrong with it. */
export function parseRecord(
  spec: EntitySpec,
  formData: FormData,
): { ok: true; values: Record<string, string | number | boolean | null> } | { ok: false; error: string } {
  const values: Record<string, string | number | boolean | null> = {};
  for (const field of spec.fields) {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") {
      values[field.name] = raw === "on";
      continue;
    }
    let value = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (field.type === "email" || field.type === "domain") value = value.toLowerCase();
    if (field.type === "domain") value = value.replace(/^https?:\/\//, "").replace(/^@/, "").replace(/\/.*$/, "");
    if (field.type === "envvar") value = value.toUpperCase();

    if (!value) {
      if (field.required) return { ok: false, error: `${field.label} is required.` };
      values[field.name] = null;
      continue;
    }
    if (field.max && value.length > field.max) {
      return { ok: false, error: `${field.label} is too long (${field.max} characters max).` };
    }
    if (field.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number.` };
      if (field.step === 1 && !Number.isInteger(n)) return { ok: false, error: `${field.label} must be a whole number.` };
      if (field.min !== undefined && n < field.min) return { ok: false, error: `${field.label} can't be below ${field.min}.` };
      if (field.max !== undefined && n > field.max) return { ok: false, error: `${field.label} can't be above ${field.max}.` };
      values[field.name] = n;
      continue;
    }
    if (field.type === "select" && !UUID.test(value)) return { ok: false, error: `Pick a ${field.label.toLowerCase()}.` };
    const pattern = PATTERNS[field.type];
    if (pattern && !pattern.re.test(value)) return { ok: false, error: `${field.label} ${pattern.message}.` };
    values[field.name] = value;
  }
  return { ok: true, values };
}

/** Database errors in words an admin can act on. */
export function friendlyError(spec: EntitySpec, error: { code?: string; message: string; details?: string | null }) {
  switch (error.code) {
    case "23505":
      return `That ${spec.singular} already exists.`;
    case "23503":
      return spec.table === "llm_providers"
        ? "This provider still has models. Delete or move them first."
        : `That ${spec.singular} is still in use.`;
    case "23514":
      return `One of the values isn't allowed (${error.message.replace(/^.*constraint "?([^"]+)"?.*$/, "$1")}).`;
    case "42501":
      return "Superadmins only.";
    default:
      return error.message;
  }
}
