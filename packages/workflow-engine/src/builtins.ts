import type {
  EvidenceRecord,
  GateMode,
  WorkflowDefinition,
  WorkflowStepContext,
  WorkflowStepDefinition,
} from "@flowness-labs/core";
import { joinPaths, pathExists, resolveIssuePaths } from "@flowness-labs/core";

export interface WorkflowStepBlueprint {
  readonly name: string;
  readonly preconditions?: readonly string[];
  readonly successConditions?: readonly string[];
  readonly humanGate?: GateMode;
  readonly next?: string | null;
}

export interface WorkflowBlueprint {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly (string | WorkflowStepBlueprint)[];
  readonly humanGates?: Partial<Record<string, GateMode>>;
}

const builtinWorkflowBlueprints: readonly WorkflowBlueprint[] = [
  {
    id: "planning",
    name: "Planning Workflow",
    steps: [
      "Idea",
      "Requirements",
      "Questions",
      "Scope",
      "Architecture",
      "Roadmap",
      "Issue Generation",
    ],
  },
  {
    id: "mvp",
    name: "MVP Workflow",
    steps: [
      "Idea",
      "Core Features",
      "MVP Scope",
      "Architecture",
      "Implementation",
      "Validation",
      "Release Candidate",
    ],
  },
  {
    id: "greenfield",
    name: "Greenfield Workflow",
    steps: [
      "Vision",
      "Problem Definition",
      "Requirements",
      "Architecture",
      "MVP Planning",
      "Backlog Generation",
      "Issue Generation",
    ],
  },
  {
    id: "research",
    name: "Research Workflow",
    steps: [
      "Question",
      "Research",
      "Comparison",
      "Recommendation",
      "Decision",
      "Documentation",
    ],
  },
  {
    id: "feature",
    name: "Feature Workflow",
    steps: [
      "Clarification",
      "Design",
      "Implementation",
      "Review",
      "Documentation",
      "Commit",
      "Close",
    ],
  },
  {
    id: "bugfix",
    name: "Bugfix Workflow",
    steps: [
      "Issue Analysis",
      "Root Cause",
      "Troubleshooting",
      "Fix",
      "Review",
      "Documentation",
      "Close",
    ],
  },
  {
    id: "refactor",
    name: "Refactor Workflow",
    steps: [
      "Current Analysis",
      "Risk Analysis",
      "Refactor",
      "Review",
      "Documentation",
      "Close",
    ],
  },
  {
    id: "harness",
    name: "Harness Workflow",
    steps: [
      "Analysis",
      "Design",
      "Workflow Update",
      "Validation",
      "Review",
      "Documentation",
      "Close",
    ],
  },
] as const;

const builtinWorkflowHumanGates: Readonly<Record<string, Partial<Record<string, GateMode>>>> = {
  planning: {
    Requirements: "always",
    Questions: "always",
    Scope: "always",
    Architecture: "always",
    Roadmap: "optional",
  },
  mvp: {
    "Core Features": "always",
    "MVP Scope": "always",
    Architecture: "always",
    Validation: "optional",
  },
  greenfield: {
    "Problem Definition": "always",
    Requirements: "always",
    Architecture: "always",
    "MVP Planning": "always",
  },
  research: {
    Question: "always",
    Recommendation: "always",
    Decision: "always",
  },
  feature: {
    Clarification: "always",
    Design: "always",
    Review: "optional",
  },
  bugfix: {
    "Issue Analysis": "always",
    "Root Cause": "always",
    Fix: "always",
    Review: "optional",
  },
  refactor: {
    "Current Analysis": "always",
    "Risk Analysis": "always",
    Refactor: "always",
    Review: "optional",
  },
  harness: {
    Analysis: "always",
    Design: "always",
    "Workflow Update": "always",
    Validation: "optional",
    Review: "optional",
  },
};

function collectDefaultStepEvidence(
  context: WorkflowStepContext,
  workflowName: string,
  stepName: string,
): Promise<EvidenceRecord[]> {
  const issuePaths = resolveIssuePaths(context.rootDir, context.issueId);
  const candidates: Array<[string, string]> = [
    [issuePaths.issueFile, "issue.md"],
    [issuePaths.issueJsonFile, "issue.json"],
    [issuePaths.workflowStateFile, "workflow-state.json"],
    [issuePaths.logFile, `${context.issueId}.md`],
    [joinPaths(issuePaths.decisionsDir, "README.md"), "decisions/README.md"],
    [joinPaths(issuePaths.reviewsDir, "README.md"), "reviews/README.md"],
  ];

  return (async () => {
    const evidence: EvidenceRecord[] = [];
    for (const [location, title] of candidates) {
      if (await pathExists(location)) {
        evidence.push({
          kind: "file",
          title,
          location,
          detail: `${workflowName} step ${stepName}`,
        });
      }
    }

    return evidence;
  })();
}

function normalizeStepBlueprint(
  step: string | WorkflowStepBlueprint,
): WorkflowStepBlueprint {
  if (typeof step === "string") {
    return {
      name: step,
    };
  }

  return step;
}

function createWorkflowStep(
  workflowName: string,
  step: WorkflowStepBlueprint,
  nextStep: string | null,
  previousStep: string | null,
  humanGate?: GateMode,
): WorkflowStepDefinition {
  const stepName = step.name;
  return {
    name: stepName,
    preconditions: step.preconditions ?? (previousStep === null
      ? ["A request or issue exists."]
      : [`"${previousStep}" has completed.`]),
    successConditions: step.successConditions ?? [
      `The ${workflowName} step "${stepName}" is documented in the log.`,
      "Evidence is attached when the step produces an artifact.",
    ],
    humanGate: step.humanGate ?? humanGate ?? "never",
    next: nextStep,
    execute: async (context) => ({
      summary: `Prepared ${workflowName} step "${stepName}".`,
      evidence: await collectDefaultStepEvidence(context, workflowName, stepName),
      nextStep,
    }),
  };
}

export function createWorkflowDefinitionFromBlueprint(
  blueprint: WorkflowBlueprint,
): WorkflowDefinition {
  const normalizedSteps = blueprint.steps.map((step) => normalizeStepBlueprint(step));
  const steps = normalizedSteps.map((step, index) => createWorkflowStep(
    blueprint.name,
    step,
    step.next ?? normalizedSteps[index + 1]?.name ?? null,
    normalizedSteps[index - 1]?.name ?? null,
    blueprint.humanGates?.[step.name] ?? builtinWorkflowHumanGates[blueprint.id]?.[step.name],
  ));

  return {
    id: blueprint.id,
    name: blueprint.name,
    steps,
  };
}

export const builtinWorkflowDefinitions: readonly WorkflowDefinition[] = builtinWorkflowBlueprints.map(
  (blueprint) => createWorkflowDefinitionFromBlueprint(blueprint),
);

export function listBuiltinWorkflows(): readonly WorkflowDefinition[] {
  return builtinWorkflowDefinitions.map((workflow) => ({
    ...workflow,
    steps: workflow.steps.map((step) => ({ ...step })),
  }));
}

export function getBuiltinWorkflowDefinition(
  workflowId: string,
): WorkflowDefinition | undefined {
  const workflow = builtinWorkflowDefinitions.find((candidate) => candidate.id === workflowId);
  if (workflow === undefined) {
    return undefined;
  }

  return {
    ...workflow,
    steps: workflow.steps.map((step) => ({ ...step })),
  };
}

export function validateBuiltinWorkflowDefinitions(): readonly string[] {
  const errors: string[] = [];
  for (const workflow of builtinWorkflowDefinitions) {
    const names = new Set<string>();
    for (const step of workflow.steps) {
      if (names.has(step.name)) {
        errors.push(`Workflow "${workflow.id}" contains duplicate step "${step.name}".`);
      }
      names.add(step.name);
    }
    if (workflow.steps.length === 0) {
      errors.push(`Workflow "${workflow.id}" has no steps.`);
    }
  }

  return errors;
}

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderStringArray(values: readonly string[], indentLevel = 0): string {
  if (values.length === 0) {
    return "[]";
  }

  const indent = "  ".repeat(indentLevel);
  const innerIndent = `${indent}  `;
  return [
    "[",
    ...values.map((value) => `${innerIndent}"${escapeTsString(value)}",`),
    `${indent}]`,
  ].join("\n");
}

function renderStepSource(workflowName: string, step: WorkflowStepDefinition): string {
  const nextStep = step.next === undefined || step.next === null ? "null" : `"${escapeTsString(step.next)}"`;
  const properties = [
    `      name: "${escapeTsString(step.name)}",`,
    `      preconditions: ${renderStringArray(step.preconditions, 3)},`,
    `      successConditions: ${renderStringArray(step.successConditions, 3)},`,
  ];

  if (step.humanGate !== undefined) {
    properties.push(`      humanGate: "${step.humanGate}",`);
  }

  properties.push(
    `      next: ${nextStep},`,
    "      execute: async (context) => ({",
    `        summary: "Prepared ${escapeTsString(step.name)} step scaffold.",`,
    `        evidence: await collectDefaultStepEvidence(context, "${escapeTsString(workflowName)}", "${escapeTsString(step.name)}"),`,
    `        nextStep: ${nextStep},`,
    "      }),",
  );

  return [
    "    {",
    ...properties,
    "    },",
  ].join("\n");
}

export function renderWorkflowScaffoldSource(workflow: WorkflowDefinition): string {
  return [
    'import { defineWorkflow } from "@flowness-labs/workflow-engine";',
    'import { joinPaths, pathExists, resolveIssuePaths } from "@flowness-labs/core";',
    "",
    "async function collectDefaultStepEvidence(context, workflowName, stepName) {",
    "  const issuePaths = resolveIssuePaths(context.rootDir, context.issueId);",
    "  const candidates = [",
    '    [issuePaths.issueFile, "issue.md"],',
    '    [issuePaths.issueJsonFile, "issue.json"],',
    '    [issuePaths.workflowStateFile, "workflow-state.json"],',
    '    [issuePaths.logFile, `${context.issueId}.md`],',
    '    [joinPaths(issuePaths.decisionsDir, "README.md"), "decisions/README.md"],',
    '    [joinPaths(issuePaths.reviewsDir, "README.md"), "reviews/README.md"],',
    "  ];",
    "",
    "  const evidence = [];",
    "  for (const [location, title] of candidates) {",
    "    if (await pathExists(location)) {",
    "      evidence.push({",
    '        kind: "file",',
    "        title,",
    "        location,",
    "        detail: `${workflowName} step ${stepName}`,",
    "      });",
    "    }",
    "  }",
    "",
    "  return evidence;",
    "}",
    "",
    "export default defineWorkflow({",
    `  id: "${workflow.id}",`,
    `  name: "${workflow.name}",`,
    "  steps: [",
    ...workflow.steps.map((step) => renderStepSource(workflow.name, step)),
    "  ],",
    "});",
    "",
  ].join("\n");
}

export function createGenericWorkflowDefinition(
  workflowId: string,
  workflowName = workflowId,
): WorkflowDefinition {
  return createWorkflowDefinitionFromBlueprint({
    id: workflowId,
    name: workflowName,
    steps: ["Intake", "Clarification", "Work", "Review", "Close"],
  });
}
