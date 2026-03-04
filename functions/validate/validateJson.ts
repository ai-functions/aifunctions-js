/**
 * Ajv-based JSON Schema validation for the JSON pipeline. Returns stable, compact errors (path + message).
 * Supports schema passed directly, schemaKey via resolver, or skillId via library index.
 */
import Ajv, { type ErrorObject } from "ajv";
import type { ContentResolver } from "nx-content";
import { getLibraryIndex } from "../../src/index.js";
import { ERR_SCHEMA_INVALID } from "../aiJsonTypes.js";

export type ValidationResultOk = { ok: true };
export type ValidationResultFail = {
  ok: false;
  errorCode: typeof ERR_SCHEMA_INVALID;
  errors: Array<{ path: string; message: string }>;
};
export type ValidationResult = ValidationResultOk | ValidationResultFail;

const ajv = new Ajv({ allErrors: true });
const schemaCache = new Map<string, ReturnType<Ajv["compile"]>>();

function cacheKey(schema: object): string {
  const id = (schema as { $id?: string }).$id;
  if (typeof id === "string") return id;
  return JSON.stringify(schema);
}

function getValidator(schema: object) {
  const key = cacheKey(schema);
  let validate = schemaCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    schemaCache.set(key, validate);
  }
  return validate;
}

function mapAjvErrors(errors: ErrorObject[] | null | undefined): Array<{ path: string; message: string }> {
  if (!errors?.length) return [];
  return errors.map((e) => ({
    path: e.instancePath ? e.instancePath.replace(/^\//, "").replace(/\//g, ".") : ".",
    message: e.message ?? "validation failed",
  }));
}

/**
 * Validate parsed value against a JSON Schema. Schema can be passed directly, or resolved via resolver + skillIdOrSchemaKey.
 * When resolver is provided and skillIdOrSchemaKey looks like a content key (contains '/'), loads schema from resolver.get.
 * Otherwise treats as skillId and loads schema from library index entry io.output.
 * If no schema can be resolved, returns { ok: true }.
 */
export async function validateJson(
  skillIdOrSchemaKey: string,
  parsed: unknown,
  options?: { resolver?: ContentResolver; schema?: object }
): Promise<ValidationResult> {
  let schema: object | undefined = options?.schema;

  if (!schema && options?.resolver) {
    const key = skillIdOrSchemaKey;
    if (key.includes("/")) {
      try {
        const raw = await options.resolver.get(key);
        const str = typeof raw === "string" ? raw : "";
        schema = str ? (JSON.parse(str) as object) : undefined;
      } catch {
        schema = undefined;
      }
    } else {
      try {
        const index = await getLibraryIndex({ resolver: options.resolver, allowMissing: true });
        const ref = index.skills.find((s) => {
          const refKey = (s as { $refKey?: string }).$refKey;
          const id = refKey?.replace(/^.*\//, "").replace(/\.json$/, "");
          return id === key;
        });
        if (ref) {
          const raw = await options.resolver.get((ref as { $refKey: string }).$refKey);
          const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as { io?: { output?: unknown } };
          schema = entry?.io?.output && typeof entry.io.output === "object" ? (entry.io.output as object) : undefined;
        }
      } catch {
        schema = undefined;
      }
    }
  }

  if (!schema || typeof schema !== "object") {
    return { ok: true };
  }

  try {
    const validate = getValidator(schema);
    const valid = validate(parsed);
    if (valid) return { ok: true };
    const errors = mapAjvErrors(validate.errors);
    return {
      ok: false,
      errorCode: ERR_SCHEMA_INVALID,
      errors,
    };
  } catch (e) {
    return {
      ok: false,
      errorCode: ERR_SCHEMA_INVALID,
      errors: [{ path: ".", message: e instanceof Error ? e.message : String(e) }],
    };
  }
}
