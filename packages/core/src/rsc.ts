import { Effect, Predicate, Schema } from "effect";

export type Json = Schema.Json;

export type JsonObject = Schema.JsonObject;

export class RscError extends Schema.TaggedError<RscError>()("RscError", {
  message: Schema.String,
  offset: Schema.optionalKey(Schema.Number),
}) {}

export class RscDocument {
  constructor(
    readonly rows: Map<string, Json>,
    private readonly imports: Set<string>,
    private readonly texts: Set<string>,
  ) {}

  /** Resolve wire models once, or pass "$<id>" to preserve text-row provenance.
   * Imports and cycle edges stay references; invalid references throw RscError.
   */
  resolve(value: Json): Json {
    const references = new Map<string, Json>();
    const memo = new Map<Json, Json>();
    const visiting = new Set<string>();
    const ancestors = new Set<Json>();

    const visit = (
      current: Json,
      path: readonly string[] = [],
      origin?: string,
    ): Json => {
      if (ancestors.size + visiting.size + path.length > 512) {
        throw new RscError({ message: "RSC resolution depth exceeds 512" });
      }

      if (Predicate.isString(current) && current.startsWith("$")) {
        const literal = current.startsWith("$$");

        const sentinel = current === "$" || current === "$undefined" ||
          current.startsWith("$S") || /^\$n-?[0-9]+$/.test(current);

        if (literal || sentinel) {
          if (path.length > 0) {
            throw new RscError({ message: "Invalid outlined RSC path" });
          }

          return literal ? current.slice(1) : current;
        }

        const match = /^\$(L|Q)?([0-9a-f]+)((?::.*)?)$/s.exec(current);
        const id = match?.[2]?.replace(/^0+(?=.)/, "");

        if (Predicate.isUndefined(id)) {
          throw new RscError({ message: "Unsupported RSC model token" });
        }

        const marker = match?.[1] ?? "";
        const outlined = match?.[3] ?? "";

        const steps = outlined.length > 0
          ? [...outlined.slice(1).split(":"), ...path]
          : path;

        const reference = `$${marker}${id}${steps.length > 0 ? `:${steps.join(":")}` : ""}`;
        const target = this.rows.get(id);

        if (Predicate.isUndefined(target)) {
          throw new RscError({ message: "Missing RSC reference row" });
        }

        if (this.imports.has(id)) {
          if (steps.length > 0 || marker === "Q") {
            throw new RscError({ message: "Cannot inspect an RSC import" });
          }

          return current;
        }

        if (this.texts.has(id)) {
          if (steps.length > 0 || marker === "Q") {
            throw new RscError({ message: "Invalid reference to an RSC text row" });
          }

          // Text rows are literal UTF-8, never model strings (even "$..." or "$$...").
          return target;
        }

        if (marker === "Q" && path.length > 0) {
          throw new RscError({ message: "Cannot traverse an RSC map as an object" });
        }

        if (visiting.has(reference)) {
          return reference;
        }

        const cached = references.get(reference);

        if (Predicate.isNotUndefined(cached)) {
          return cached;
        }

        visiting.add(reference);
        const resolved = visit(target, steps, reference);
        visiting.delete(reference);

        if (marker === "Q" && resolved !== reference) {
          if (
            !isArray(resolved) ||
            resolved.some((entry) => !isArray(entry) || entry.length !== 2)
          ) {
            throw new RscError({ message: "RSC map must reference key/value pairs" });
          }
        }

        references.set(reference, resolved);

        return resolved;
      }

      const [property, ...remaining] = path;

      if (Predicate.isNotUndefined(property)) {
        let child: Json | undefined;

        if (isArray(current)) {
          if (property === "props" && current[0] === "$" && current.length >= 4) {
            child = current[3];
          } else if (property === "length") {
            child = current.length;
          } else if (/^(0|[1-9][0-9]*)$/.test(property) && Object.hasOwn(current, property)) {
            child = current[Number(property)];
          }
        } else if (isObject(current) && Object.hasOwn(current, property)) {
          child = current[property];
        }

        if (Predicate.isUndefined(child)) {
          throw new RscError({ message: "Invalid outlined RSC path" });
        }

        return visit(child, remaining, origin);
      }

      if (!isArray(current) && !isObject(current)) {
        return current;
      }

      if (ancestors.has(current)) {
        if (Predicate.isNotUndefined(origin)) {
          return origin;
        }

        throw new RscError({ message: "Cyclic input is not a wire JSON model" });
      }

      const cached = memo.get(current);

      if (Predicate.isNotUndefined(cached)) {
        return cached;
      }

      ancestors.add(current);

      const resolved = isArray(current)
        ? current.map((child) => visit(child))
        : Object.fromEntries<Json>(
          Object.entries(current).map(([key, child]) => [key, visit(child)]),
        );

      ancestors.delete(current);
      memo.set(current, resolved);

      return resolved;
    };

    return visit(value);
  }
}

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

/** Parse a complete Flight body containing only model, import, and text rows. */
export function parseRsc(text: string): Effect.Effect<RscDocument, RscError> {
  return Effect.suspend(() => {
    let offset = 0;

    return Effect.try({
      try: () => {
        if (text.length === 0 || !text.isWellFormed()) {
          throw new RscError({ message: "Empty or ill-formed RSC body", offset });
        }

        const bytes = new TextEncoder().encode(text);
        const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
        const rows = new Map<string, Json>();
        const imports = new Set<string>();
        const texts = new Set<string>();

        while (offset < bytes.length) {
          const colon = bytes.indexOf(58, offset);

          if (colon === -1) {
            throw new RscError({ message: "Truncated RSC row header", offset });
          }

          const header = decoder.decode(bytes.subarray(offset, colon));

          if (!/^[0-9a-f]+$/.test(header)) {
            throw new RscError({ message: "Invalid hexadecimal RSC row id", offset });
          }

          const id = header.replace(/^0+(?=.)/, "");

          if (rows.has(id)) {
            throw new RscError({ message: "Duplicate RSC row id", offset });
          }

          const start = colon + 1;
          const tag = bytes[start];

          if (tag === 84) {
            const comma = bytes.indexOf(44, start + 1);

            if (comma === -1) {
              throw new RscError({ message: "Truncated RSC text length", offset });
            }

            const length = decoder.decode(bytes.subarray(start + 1, comma));

            if (!/^[0-9a-f]+$/.test(length)) {
              throw new RscError({ message: "Invalid hexadecimal RSC text length", offset });
            }

            const size = Number.parseInt(length, 16);

            if (!Number.isSafeInteger(size) || size > bytes.length - comma - 1) {
              throw new RscError({ message: "Truncated or oversized RSC text row", offset });
            }

            const end = comma + 1 + size;
            rows.set(id, decoder.decode(bytes.subarray(comma + 1, end)));
            texts.add(id);
            offset = end;
            continue;
          }

          const newline = bytes.indexOf(10, start);

          if (newline === -1) {
            throw new RscError({ message: "Truncated RSC JSON row", offset });
          }

          const payload = decoder.decode(bytes.subarray(tag === 73 ? start + 1 : start, newline));

          if (tag !== 73 && !/^[[{"0-9tfn\- \t\r]/.test(payload)) {
            throw new RscError({ message: "Unsupported RSC row format", offset });
          }

          rows.set(id, decodeJson(payload));

          if (tag === 73) {
            imports.add(id);
          }

          offset = newline + 1;
        }

        return new RscDocument(rows, imports, texts);
      },
      // Schema/UTF-8 errors can retain input. Never attach them or payload snippets.
      catch: (cause) => cause instanceof RscError
        ? cause
        : new RscError({ message: "Invalid JSON or UTF-8 in RSC row", offset }),
    });
  });
}

function isObject(value: Json): value is JsonObject {
  return Predicate.isObject(value);
}

function isArray(value: Json): value is Schema.JsonArray {
  return Predicate.isObjectOrArray(value) && !Predicate.isObject(value);
}

/** Depth-first traversal; each object identity is yielded once. Resolve first. */
export function* objects(value: Json): Iterable<JsonObject> {
  const pending: Json[] = [value];
  const seen = new Set<Json>();

  while (pending.length > 0) {
    const current = pending.pop();

    if (Predicate.isUndefined(current) || seen.has(current)) {
      continue;
    }

    seen.add(current);

    if (isArray(current)) {
      for (const child of current.toReversed()) {
        pending.push(child);
      }
    } else if (isObject(current)) {
      yield current;

      for (const child of Object.values(current).reverse()) {
        pending.push(child);
      }
    }
  }
}
