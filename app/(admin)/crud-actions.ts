"use server";

import { revalidatePath } from "next/cache";
import { adminOrNull } from "@/lib/admin";
import { ENTITIES, friendlyError, isEntityKey, parseRecord, type EntityKey } from "@/lib/entities";

export type CrudState = { status: "idle" | "ok" | "error"; message?: string; at?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Creates a row (id null) or updates one, after validating against the entity's spec. */
export async function saveRecord(
  entity: EntityKey,
  id: string | null,
  _prev: CrudState,
  formData: FormData,
): Promise<CrudState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", message: "Superadmins only." };
  if (!isEntityKey(entity) || (id !== null && !UUID.test(id))) return { status: "error", message: "Unknown record." };

  const spec = ENTITIES[entity];
  const parsed = parseRecord(spec, formData);
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const table = admin.supabase.from(spec.table);
  const { data, error } = id
    ? await table.update(parsed.values).eq("id", id).select("id")
    : await table.insert(parsed.values).select("id");
  if (error) return { status: "error", message: friendlyError(spec, error) };
  if (!data?.length) return { status: "error", message: `That ${spec.singular} no longer exists.` };

  spec.paths.forEach((p) => revalidatePath(p));
  return { status: "ok", message: id ? "Saved." : `Added the ${spec.singular}.`, at: Date.now() };
}

export async function deleteRecord(entity: EntityKey, id: string): Promise<CrudState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", message: "Superadmins only." };
  if (!isEntityKey(entity) || !UUID.test(id)) return { status: "error", message: "Unknown record." };

  const spec = ENTITIES[entity];
  const { data, error } = await admin.supabase.from(spec.table).delete().eq("id", id).select("id");
  if (error) return { status: "error", message: friendlyError(spec, error) };
  if (!data?.length) return { status: "error", message: `That ${spec.singular} was already deleted.` };

  spec.paths.forEach((p) => revalidatePath(p));
  return { status: "ok", message: "Deleted.", at: Date.now() };
}
