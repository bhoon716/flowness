import type {
  FlownessProjectConfig,
  HumanGateConfig,
  IssueType,
  ReviewRole,
} from "./types.js";
import { pathExists, readTextFile, writeTextFile } from "./filesystem.js";
import { resolveWorkspacePaths } from "./workspace.js";
import { reviewRoleValues } from "./types.js";

export const defaultHumanGate: HumanGateConfig = {
  clarification: "always",
  design: "always",
  review: "optional",
  implementation: "never",
};

export const defaultReviewAgents: readonly ReviewRole[] = [
  "Architecture Reviewer",
  "Security Reviewer",
  "Testing Reviewer",
  "Documentation Reviewer",
  "Maintainability Reviewer",
  "Performance Reviewer",
];

export const defaultWorkflowMapping: Record<IssueType, string> = {
  feature: "feature",
  bugfix: "bugfix",
  refactor: "refactor",
  research: "research",
  investigation: "research",
  planning: "planning",
  mvp: "mvp",
  harness: "harness",
  documentation: "feature",
  decision: "planning",
};

type HumanGateField = keyof HumanGateConfig;

const humanGateFieldMatchers: readonly [HumanGateField, RegExp][] = [
  ["clarification", /(clarification|clarify|clarify step|질문|확인|명확화)/i],
  ["design", /(design|설계|아키텍처|architecture)/i],
  ["review", /(review|검토|리뷰|검증)/i],
  ["implementation", /(implementation|implement|구현|실행)/i],
];

const humanGateModeMatchers: readonly [HumanGateConfig[HumanGateField], RegExp][] = [
  ["always", /(always|항상|매번|무조건|반드시)/i],
  ["optional", /(optional|선택|필요하면|가끔|상황에 따라)/i],
  ["never", /(never|안 물어봐|묻지마|물어보지 마|절대)/i],
];

export function createDefaultProjectConfig(
  projectName: string,
): FlownessProjectConfig {
  return {
    projectName,
    humanGate: defaultHumanGate,
    defaultWorkflows: defaultWorkflowMapping,
    reviewAgents: defaultReviewAgents,
    documentationRules: {
      appendOnly: true,
      preservePromptText: true,
    },
  };
}

function detectHumanGateField(instruction: string): HumanGateField | null {
  for (const [field, matcher] of humanGateFieldMatchers) {
    if (matcher.test(instruction)) {
      return field;
    }
  }

  return null;
}

function detectHumanGateMode(
  instruction: string,
): HumanGateConfig[HumanGateField] | null {
  for (const [mode, matcher] of humanGateModeMatchers) {
    if (matcher.test(instruction)) {
      return mode;
    }
  }

  return null;
}

export function applyHumanGateInstruction(
  config: FlownessProjectConfig,
  instruction: string,
): FlownessProjectConfig {
  const field = detectHumanGateField(instruction);
  const mode = detectHumanGateMode(instruction);

  if (field === null || mode === null) {
    throw new Error(`Could not interpret human gate instruction: ${instruction}`);
  }

  return {
    ...config,
    humanGate: {
      ...config.humanGate,
      [field]: mode,
    },
  };
}

function renderYamlValue(value: unknown, indentLevel: number): string {
  const indent = "  ".repeat(indentLevel);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((item) => `${indent}- ${renderYamlValue(item, indentLevel + 1).trimStart()}`)
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, item]) => {
        const rendered = renderYamlValue(item, indentLevel + 1);
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return `${indent}${key}:\n${rendered}`;
        }

        if (Array.isArray(item)) {
          return `${indent}${key}:\n${rendered}`;
        }

        return `${indent}${key}: ${rendered}`;
      })
      .join("\n");
  }

  if (typeof value === "string") {
    if (value.length === 0) {
      return '""';
    }

    if (/[:#\n\r]/.test(value) || value !== value.trim()) {
      return JSON.stringify(value);
    }

    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  if (value === null || value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}

export function renderProjectConfigYaml(
  config: FlownessProjectConfig,
): string {
  return [
    `project_name: ${renderYamlValue(config.projectName, 0)}`,
    "human_gate:",
    `  clarification: ${renderYamlValue(config.humanGate.clarification, 0)}`,
    `  design: ${renderYamlValue(config.humanGate.design, 0)}`,
    `  review: ${renderYamlValue(config.humanGate.review, 0)}`,
    `  implementation: ${renderYamlValue(config.humanGate.implementation, 0)}`,
    "default_workflows:",
    `  feature: ${renderYamlValue(config.defaultWorkflows.feature, 0)}`,
    `  bugfix: ${renderYamlValue(config.defaultWorkflows.bugfix, 0)}`,
    `  refactor: ${renderYamlValue(config.defaultWorkflows.refactor, 0)}`,
    `  research: ${renderYamlValue(config.defaultWorkflows.research, 0)}`,
    `  investigation: ${renderYamlValue(config.defaultWorkflows.investigation, 0)}`,
    `  planning: ${renderYamlValue(config.defaultWorkflows.planning, 0)}`,
    `  mvp: ${renderYamlValue(config.defaultWorkflows.mvp, 0)}`,
    `  harness: ${renderYamlValue(config.defaultWorkflows.harness, 0)}`,
    `  documentation: ${renderYamlValue(config.defaultWorkflows.documentation, 0)}`,
    `  decision: ${renderYamlValue(config.defaultWorkflows.decision, 0)}`,
    "review_agents:",
    ...config.reviewAgents.map((agent) => `  - ${renderYamlValue(agent, 0)}`),
    "documentation_rules:",
    `  append_only: ${renderYamlValue(config.documentationRules.appendOnly, 0)}`,
    `  preserve_prompt_text: ${renderYamlValue(config.documentationRules.preservePromptText, 0)}`,
    "",
  ].join("\n");
}

function unquoteYamlValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseYamlBoolean(value: string): boolean {
  const normalized = unquoteYamlValue(value).toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`Invalid boolean value in Flowness config: ${value}`);
}

function parseRequiredSectionKey(
  section: string | null,
  line: string,
  expectedSection: string,
): string {
  if (section !== expectedSection) {
    throw new Error(`Unexpected config line outside of "${expectedSection}" section: ${line}`);
  }

  return line;
}

export function parseProjectConfigYaml(
  text: string,
  fallbackProjectName = "flowness",
): FlownessProjectConfig {
  const defaults = createDefaultProjectConfig(fallbackProjectName);
  const humanGate = {
    clarification: defaults.humanGate.clarification,
    design: defaults.humanGate.design,
    review: defaults.humanGate.review,
    implementation: defaults.humanGate.implementation,
  };
  const defaultWorkflows: Record<IssueType, string> = { ...defaults.defaultWorkflows };
  let projectName = defaults.projectName;
  let section: string | null = null;
  const reviewAgents: ReviewRole[] = [];
  const documentationRules = {
    ...defaults.documentationRules,
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    if (!rawLine.startsWith(" ") && trimmed.endsWith(":")) {
      section = trimmed.slice(0, -1);
      continue;
    }

    if (section === "review_agents") {
      const entry = parseRequiredSectionKey(section, trimmed, "review_agents");
      if (!entry.startsWith("- ")) {
        throw new Error(`Invalid review_agents entry: ${rawLine}`);
      }

      const agent = unquoteYamlValue(entry.slice(2));
      if (!reviewRoleValues.includes(agent as ReviewRole)) {
        throw new Error(`Unknown review agent in config: ${agent}`);
      }
      reviewAgents.push(agent as ReviewRole);
      continue;
    }

    const keyValue = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValue) {
      throw new Error(`Invalid config line: ${rawLine}`);
    }

    const key = keyValue[1];
    const rawValue = keyValue[2];
    if (key === undefined || rawValue === undefined) {
      throw new Error(`Invalid config line: ${rawLine}`);
    }
    const value = unquoteYamlValue(rawValue);

    if (rawLine.startsWith("  ")) {
      if (section === "human_gate") {
        switch (key) {
          case "clarification":
            humanGate.clarification = value as HumanGateConfig["clarification"];
            break;
          case "design":
            humanGate.design = value as HumanGateConfig["design"];
            break;
          case "review":
            humanGate.review = value as HumanGateConfig["review"];
            break;
          case "implementation":
            humanGate.implementation = value as HumanGateConfig["implementation"];
            break;
          default:
            throw new Error(`Unknown human_gate key in config: ${key}`);
        }
        continue;
      }

      if (section === "default_workflows") {
        if (!(key in defaultWorkflows)) {
          throw new Error(`Unknown default_workflows key in config: ${key}`);
        }
        defaultWorkflows[key as IssueType] = value;
        continue;
      }

      if (section === "documentation_rules") {
        switch (key) {
          case "append_only":
            documentationRules.appendOnly = parseYamlBoolean(value);
            break;
          case "preserve_prompt_text":
            documentationRules.preservePromptText = parseYamlBoolean(value);
            break;
          default:
            throw new Error(`Unknown documentation_rules key in config: ${key}`);
        }
        continue;
      }

      throw new Error(`Unexpected nested config section "${section}" for line: ${rawLine}`);
    }

    if (key === "project_name") {
      projectName = value;
      continue;
    }

    throw new Error(`Unknown top-level config key: ${key}`);
  }

  return {
    projectName,
    humanGate,
    defaultWorkflows,
    reviewAgents: reviewAgents.length > 0 ? reviewAgents : defaults.reviewAgents,
    documentationRules,
  };
}

export async function readProjectConfig(
  rootDir: string,
): Promise<FlownessProjectConfig> {
  const paths = resolveWorkspacePaths(rootDir);
  if (!(await pathExists(paths.configPath))) {
    return createDefaultProjectConfig(rootDir.split(/[/\\]/).filter(Boolean).at(-1) ?? "flowness");
  }

  const text = await readTextFile(paths.configPath);
  return parseProjectConfigYaml(text, rootDir.split(/[/\\]/).filter(Boolean).at(-1) ?? "flowness");
}

export async function writeProjectConfig(
  rootDir: string,
  config: FlownessProjectConfig,
  force = false,
): Promise<"written" | "skipped"> {
  const paths = resolveWorkspacePaths(rootDir);
  return writeTextFile(paths.configPath, renderProjectConfigYaml(config), force);
}
