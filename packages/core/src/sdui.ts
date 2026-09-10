import { Effect, Predicate, Schema } from "effect";
import { objects, parseRsc, RscError, type Json, type JsonObject } from "./rsc.ts";

export const Job = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  company: Schema.String,
  location: Schema.String,
  url: Schema.String,
  description: Schema.NullOr(Schema.String),
  applyUrl: Schema.NullOr(Schema.String),
});

export type Job = typeof Job.Type;

export interface JobReference {
  job: Job;
  screen: JsonObject;
}

export interface SearchPage {
  jobs: JobReference[];
  next: JsonObject | null;
  index: number;
  totalPages: number;
}

export class ProtocolError extends Schema.TaggedError<ProtocolError>()("ProtocolError", {
  message: Schema.String,
}) {}

const decodeJob = Schema.decodeUnknownSync(Job);

function protocolError(cause: Error | null): ProtocolError {
  return cause instanceof ProtocolError
    ? cause
    : new ProtocolError({ message: "Invalid SDUI response" });
}

function isObject(value: Json | undefined): value is JsonObject {
  return Predicate.isObject(value);
}

function object(value: Json | undefined): JsonObject {
  if (!isObject(value)) {
    throw new ProtocolError({ message: "Expected an SDUI object" });
  }

  return value;
}

function isArray(value: Json | undefined): value is Schema.JsonArray {
  return Predicate.isObjectOrArray(value) && !Predicate.isObject(value);
}

function one<T>(values: readonly T[], message: string): T {
  const value = values[0];

  if (values.length !== 1 || Predicate.isUndefined(value)) {
    throw new ProtocolError({ message });
  }

  return value;
}

function bindingId(binding: Json | undefined): string {
  const value = object(object(object(binding).key).value);

  if (value.$case !== "id" || !Predicate.isString(value.id)) {
    throw new ProtocolError({ message: "Unsupported SDUI state key" });
  }

  return value.id;
}

function elements(root: Json | undefined, tag: string): JsonObject[] {
  const pending = [root];
  const seen = new Set<Json>();
  const matches: JsonObject[] = [];

  while (pending.length > 0) {
    const value = pending.pop();

    if (Predicate.isUndefined(value) || seen.has(value)) {
      continue;
    }

    seen.add(value);

    if (isArray(value)) {
      if (value[0] === "$" && value[1] === tag) {
        matches.push(object(value[3]));
      }

      pending.push(...value.toReversed());
    } else if (isObject(value)) {
      pending.push(...Object.values(value).reverse());
    }
  }

  return matches;
}

function render(value: Json | undefined, markdown = false): string {
  if (Predicate.isString(value)) {
    return value === "$undefined" ? "" : value;
  }

  if (Predicate.isNumber(value)) {
    return String(value);
  }

  if (isArray(value)) {
    if (value[0] !== "$") {
      return value.map((child) => render(child, markdown)).join("");
    }

    const tag = value[1];
    const content = render(object(value[3]), markdown);

    if (tag === "br") {
      return markdown ? "\n" : " ";
    }

    if (markdown) {
      switch (tag) {
        case "strong":
        case "b":
          return content.trim() ? content.replace(content.trim(), () => `**${content.trim()}**`) : content;
        case "em":
        case "i":
          return content.trim() ? content.replace(content.trim(), () => `*${content.trim()}*`) : content;
        case "p":
          return `\n\n${content.trim()}\n\n`;
        case "li":
          return `- ${content.trim().replace(/\n/g, "\n    ")}\n`;
        case "ul":
          return `\n\n${content.trim()}\n\n`;
        case "ol": {
          let index = 0;
          const numbered = content.replace(/^- /gm, () => `${++index}. `);

          return `\n\n${numbered.trim()}\n\n`;
        }
      }
    }

    return content;
  }

  if (isObject(value)) {
    return render(value.textProps ?? value.children, markdown);
  }

  return "";
}

function screenFrom(actions: Json | undefined): JsonObject {
  const screens: JsonObject[] = [];

  for (const action of objects(actions ?? null)) {
    if (action.$type !== "proto.sdui.actions.core.Navigate") {
      continue;
    }

    const content = object(object(action.value).content);

    if (content.$case === "screen") {
      screens.push(object(content.screen));
    }
  }

  return one(screens, "Expected one SDUI screen navigation");
}

function reference(card: JsonObject): JobReference {
  const componentKey = card.componentKey;

  if (!Predicate.isString(componentKey) || !/^job-card-component-ref-\d+$/.test(componentKey)) {
    throw new ProtocolError({ message: "Invalid job card identifier" });
  }

  const id = componentKey.slice("job-card-component-ref-".length);
  const label = `JobSearchResultsPage_A11yLabel${id}`;
  const branches: Json[] = [];

  for (const node of objects(card)) {
    if (
      Predicate.isUndefined(node.selectedStateKey) ||
      bindingId(node.selectedStateKey) !== `JobCardFrameworkImplDismissedState_${id}`
    ) {
      continue;
    }

    if (!isArray(node.states)) {
      throw new ProtocolError({ message: "Invalid job card state map" });
    }

    for (const pair of node.states) {
      if (!isArray(pair) || pair[0] !== "Default" || Predicate.isUndefined(pair[1])) {
        continue;
      }

      if (Array.from(objects(pair[1])).some((child) => child.stateKey === label)) {
        branches.push(pair[1]);
      }
    }
  }

  const branch = one(branches, "Expected one labeled Default job card branch");
  const titles: JsonObject[] = [];
  const locations: JsonObject[] = [];

  for (const node of objects(branch)) {
    if (Predicate.isUndefined(node.textProps)) {
      continue;
    }

    const props = object(node.textProps);

    const target = Array.from(objects(props)).some((child) => child.stateKey === label)
      ? titles
      : locations;

    target.push(props);
  }

  const title = one(titles, "Expected one job card title");

  const span = one(
    elements(title.children, "span").filter((props) => props["aria-hidden"] === "true"),
    "Expected one visible job title span",
  );

  const company = one(elements(branch, "p"), "Expected one job card company");
  const location = one(locations, "Expected one job card location");

  const host = one(
    Array.from(objects(card)).filter((node) => node.componentkey === componentKey &&
      !Predicate.isUndefined(node.triggers)),
    "Expected one job card action host",
  );

  const screen = screenFrom(host.triggers);
  const currentJob = object(object(screen.requestedArguments).payload).currentJobId;

  if (
    screen.screenId !== "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails" ||
    !isArray(currentJob) || object(currentJob[0]).staticValue !== id
  ) {
    throw new ProtocolError({ message: "Job card navigation does not match its identifier" });
  }

  const job = decodeJob({
    id,
    title: render(span.children).trim(),
    company: render(company.children).trim(),
    location: render(location.children).trim(),
    url: `https://www.linkedin.com/jobs/view/${id}/`,
    description: null,
    applyUrl: null,
  });

  if (!job.title || !job.company || !job.location) {
    throw new ProtocolError({ message: "Job card has empty text" });
  }

  return { job, screen };
}

function clean(value: Json): Json {
  if (isArray(value)) {
    return value.map(clean);
  }

  if (isObject(value)) {
    const entries: [string, Json][] = [];

    for (const [key, child] of Object.entries(value)) {
      if (child !== "$undefined") {
        entries.push([key, clean(child)]);
      }
    }

    return Object.fromEntries(entries);
  }

  return value;
}

function materialize(screen: JsonObject, store: ReadonlyMap<string, JsonObject>): JsonObject {
  if (screen.$type !== "proto.sdui.actions.core.NavigateToScreen") {
    throw new ProtocolError({ message: "Expected NavigateToScreen" });
  }

  const requested = object(screen.requestedArguments);
  const { $type, requestedStateKeys, ...argumentsToSend } = requested;

  if ($type !== "proto.sdui.actions.requests.RequestedArguments" || !isArray(requestedStateKeys)) {
    throw new ProtocolError({ message: "Invalid requested screen arguments" });
  }

  const states = requestedStateKeys.map((binding) => {
    const id = bindingId(binding);
    const stored = store.get(id);

    if (Predicate.isUndefined(stored) || !Predicate.isString(stored.$case)) {
      throw new ProtocolError({ message: "Requested SDUI state is missing" });
    }

    const scalar = stored[stored.$case];

    if (Predicate.isUndefined(scalar) || Predicate.isObjectOrArray(scalar)) {
      throw new ProtocolError({ message: "Requested SDUI state is not scalar" });
    }

    const namespaces = new Set<string>();

    for (const node of objects(object(requested.payload))) {
      if (isObject(node.value) && node.value.key === id &&
        Predicate.isString(node.value.namespace)) {
        namespaces.add(node.value.namespace);
      }
    }

    return {
      key: id,
      namespace: one([...namespaces], "Expected one namespace for requested state"),
      value: scalar,
      originalProtoCase: stored.$case,
      protoKey: { $type: "proto.sdui.Key", value: object(object(object(binding).key).value) },
    };
  });

  return object(clean({
    ...screen,
    requestedArguments: { ...argumentsToSend, states, screenId: "", knownTemplateIds: [] },
  }));
}

export class Sdui {
  private readonly states = new Map<string, JsonObject>();

  private read(text: string): Effect.Effect<Json, RscError | ProtocolError> {
    return Effect.flatMap(parseRsc(text), (doc) => Effect.try({
      try: () => doc.resolve(Array.from(doc.rows.keys(), (id) => `$${id}`)),
      catch: () => new RscError({ message: "Unable to resolve SDUI RSC models" }),
    }));
  }

  page(text: string): Effect.Effect<SearchPage, RscError | ProtocolError> {
    return Effect.flatMap(this.read(text), (root) => Effect.try({
      try: () => {
        for (const node of objects(root)) {
          if (Predicate.isUndefined(node.modelStates)) {
            continue;
          }

          if (!isArray(node.modelStates)) {
            throw new ProtocolError({ message: "Invalid SDUI model states" });
          }

          for (const state of node.modelStates) {
            const entry = object(state);
            this.states.set(bindingId(entry.key), object(entry.value));
          }
        }

        const jobs: JobReference[] = [];
        const pagers: JsonObject[] = [];

        for (const node of objects(root)) {
          if (Predicate.isString(node.componentKey) && node.componentKey.startsWith("job-card-component-ref-")) {
            jobs.push(reference(node));
          }

          if (["currentIndicatorIndexBinding", "indicatorCountBinding", "onClickNextAction", "onClickPrevAction"]
            .every((key) => Object.hasOwn(node, key))) {
            pagers.push(node);
          }
        }

        if (new Set(jobs.map(({ job }) => job.id)).size !== jobs.length) {
          throw new ProtocolError({ message: "Duplicate job cards" });
        }

        const pager = one(pagers, "Expected one search pager");
        const currentId = bindingId(pager.currentIndicatorIndexBinding);
        const current = this.states.get(currentId);
        const total = this.states.get(bindingId(pager.indicatorCountBinding));
        const index = current?.intValue;
        const totalPages = total?.intValue;

        if (current?.$case !== "intValue" || total?.$case !== "intValue" ||
          !Predicate.isNumber(index) || !Number.isSafeInteger(index) || index < 0 ||
          !Predicate.isNumber(totalPages) || !Number.isSafeInteger(totalPages) || totalPages < 0 ||
          (totalPages > 0 && index >= totalPages)) {
          throw new ProtocolError({ message: "Invalid search pagination state" });
        }

        let next: JsonObject | null = null;

        if (index + 1 < totalPages) {
          const screen = screenFrom(pager.onClickNextAction);
          const advanced = { ...current, intValue: index + 1 };
          const pending = new Map(this.states);
          pending.set(currentId, advanced);
          next = materialize(screen, pending);
          // Later pages' cards request the previous page's binding, so retain its advanced value.
          this.states.set(currentId, advanced);
        }

        return { jobs, next, index, totalPages };
      },
      catch: (cause) => protocolError(cause instanceof Error ? cause : null),
    }));
  }

  navigate(screen: JsonObject): Effect.Effect<JsonObject, ProtocolError> {
    return Effect.try({
      try: () => materialize(screen, this.states),
      catch: (cause) => protocolError(cause instanceof Error ? cause : null),
    });
  }

  detail(text: string, job: Job): Effect.Effect<Job, RscError | ProtocolError> {
    return Effect.flatMap(this.read(text), (root) => Effect.try({
      try: () => {
        const metadata = Array.from(objects(root)).filter((node) => node.jobId === job.id);

        const named = (name: string) => one([...new Set(metadata.flatMap((node) =>
          Object.hasOwn(node, name) ? [node[name]] : []))], "Missing or conflicting job metadata");

        const onsite = named("isOnsiteApply");

        if (!Predicate.isBoolean(onsite)) {
          throw new ProtocolError({ message: "Invalid onsite application metadata" });
        }

        return decodeJob({
          ...job,
          title: named("jobTitle"),
          company: named("companyName"),
          applyUrl: onsite ? null : named("offsiteApplyUrl"),
        });
      },
      catch: (cause) => protocolError(cause instanceof Error ? cause : null),
    }));
  }

  description(text: string, job: Job): Effect.Effect<Job, RscError | ProtocolError> {
    return Effect.flatMap(this.read(text), (root) => Effect.try({
      try: () => {
        const wrapper = one(Array.from(objects(root)).filter((node) =>
          node["data-sdui-component"] === "com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"),
        "Expected one about-the-job component");

        const description = one(Array.from(objects(wrapper)).filter((node) =>
          node.expansionKey === `jdp_job_description_expansion_${job.id}` &&
          !Predicate.isUndefined(node.textProps)), "Expected one matching job description");

        const markdown = render(object(description.textProps).children, true)
          .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

        if (!markdown) {
          throw new ProtocolError({ message: "Empty job description" });
        }

        return decodeJob({ ...job, description: markdown });
      },
      catch: (cause) => protocolError(cause instanceof Error ? cause : null),
    }));
  }
}
