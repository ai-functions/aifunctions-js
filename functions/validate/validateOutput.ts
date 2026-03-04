/**
 * Contract stability: validate skill output against the declared output schema.
 * Use the library index io.output (restricted JSON Schema) so prompt changes don't break clients.
 * See docs/CONTRACT_STABILITY.md.
 */
import type { ContentResolver } from "nx-content";
import type { RestrictedJsonSchemaObject } from "../../src/index.js";
import { getLibraryIndex } from "../../src/index.js";

export type ValidateOutputResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Validate a value against a restricted JSON Schema object (type, required, properties, no extra props).
 * Supports: type, required, properties, additionalProperties, items (array), enum, minimum, maximum, minLength, maxLength.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: RestrictedJsonSchemaObject,
  path: string = "."
): ValidateOutputResult {
  const errors: string[] = [];

  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { valid: false, errors: [`${path}: expected object`] };
    }
    const obj = value as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown> | undefined;
    const required = (schema.required as string[] | undefined) ?? [];
    const noExtra = schema.additionalProperties !== true;

    for (const key of required) {
      if (!(key in obj)) {
        errors.push(`${path}: missing required property '${key}'`);
      }
    }
    if (props) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          if (noExtra) errors.push(`${path}: unknown property '${key}'`);
        } else {
          const propSchema = props[key] as Record<string, unknown> | undefined;
          if (propSchema && typeof propSchema === "object") {
            const sub = validateAgainstSchema(
              obj[key],
              propSchema as RestrictedJsonSchemaObject,
              `${path}.${key}`
            );
            if (!sub.valid) errors.push(...(sub.errors ?? []));
          }
        }
      }
    }
  } else if ((schema as { type?: string }).type === "array") {
    if (!Array.isArray(value)) {
      return { valid: false, errors: [`${path}: expected array`] };
    }
    const itemsSchema = (schema as { items?: RestrictedJsonSchemaObject }).items;
    if (itemsSchema && typeof itemsSchema === "object") {
      for (let i = 0; i < value.length; i++) {
        const sub = validateAgainstSchema(
          value[i],
          itemsSchema as RestrictedJsonSchemaObject,
          `${path}[${i}]`
        );
        if (!sub.valid) errors.push(...(sub.errors ?? []));
      }
    }
  } else {
    const t = (schema as { type?: string }).type;
    if (t === "string") {
      if (typeof value !== "string") errors.push(`${path}: expected string`);
      else {
        const min = (schema as { minLength?: number }).minLength;
        const max = (schema as { maxLength?: number }).maxLength;
        if (min != null && value.length < min)
          errors.push(`${path}: string length < minLength ${min}`);
        if (max != null && value.length > max)
          errors.push(`${path}: string length > maxLength ${max}`);
      }
    } else if (t === "number") {
      if (typeof value !== "number") errors.push(`${path}: expected number`);
      else {
        const min = (schema as { minimum?: number }).minimum;
        const max = (schema as { maximum?: number }).maximum;
        if (min != null && value < min) errors.push(`${path}: number < minimum ${min}`);
        if (max != null && value > max) errors.push(`${path}: number > maximum ${max}`);
      }
    } else if (t === "boolean") {
      if (typeof value !== "boolean") errors.push(`${path}: expected boolean`);
    } else {
      const schemaWithEnum = schema as RestrictedJsonSchemaObject & { enum?: unknown[] };
      if (Array.isArray(schemaWithEnum.enum)) {
        if (!schemaWithEnum.enum.includes(value)) errors.push(`${path}: value not in enum`);
      }
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

export type ValidateOutputOptions = {
  /** Content resolver to load library index and per-skill entry. If omitted, only validateAgainstSchema is used when outputSchema is provided. */
  resolver?: ContentResolver;
  /** Use this schema when resolver is not provided or skill not in index. */
  outputSchema?: RestrictedJsonSchemaObject;
};

/**
 * Validate parsed skill output against the skill's contract.
 * When resolver is provided, loads the library index and the skill's index entry and uses io.output.
 * Otherwise uses options.outputSchema if provided.
 * Returns { valid: true } or { valid: false, errors }.
 */
export async function validateOutput(
  skillId: string,
  parsed: unknown,
  options: ValidateOutputOptions = {}
): Promise<ValidateOutputResult> {
  const { resolver, outputSchema } = options;

  if (outputSchema) {
    return validateAgainstSchema(parsed, outputSchema);
  }

  if (!resolver) {
    return { valid: true };
  }

  try {
    const index = await getLibraryIndex({ resolver, allowMissing: true });
    const ref = index.skills.find((s) => {
      const refKey = (s as { $refKey?: string }).$refKey;
      const id = refKey?.replace(/^.*\//, "").replace(/\.json$/, "");
      return id === skillId;
    });
    if (!ref) return { valid: true };

    const raw = await resolver.get((ref as { $refKey: string }).$refKey);
    const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as {
      id?: string;
      io?: { output?: unknown };
    };
    if (!entry?.io?.output) return { valid: true };

    const schema = entry.io.output as RestrictedJsonSchemaObject;
    if (schema.type !== "object" || !schema.properties) {
      return { valid: true };
    }
    return validateAgainstSchema(parsed, schema);
  } catch {
    return { valid: true };
  }
}
