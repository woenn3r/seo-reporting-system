// Runtime validation against the SSOT contract (contracts/social_studio/v1.schema.json).
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "@contracts/social_studio/v1.schema.json";
import type { Workspace } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(schema);

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateWorkspace(data: unknown): ValidationResult {
  const ok = validateFn(data) as boolean;
  const errors = ok ? [] : (validateFn.errors ?? []).slice(0, 20).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
  return { ok, errors };
}

export function assertWorkspace(data: unknown): Workspace {
  const res = validateWorkspace(data);
  if (!res.ok) throw new Error(`Ungültige Workspace-Daten:\n${res.errors.join("\n")}`);
  return data as Workspace;
}
