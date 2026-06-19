import type { IssueType, WorkflowDefinition } from "@flowness-labs/core";

export interface TemplateDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
}

export const builtInTemplates: readonly TemplateDefinition[] = [
  {
    id: "issue-summary",
    title: "Issue Summary",
    description: "Baseline template for issue records.",
    body: "# Issue Summary\n\nDescribe the issue here.\n",
  },
  {
    id: "decision",
    title: "Decision Record",
    description: "Baseline template for decision documents.",
    body: "# Decision\n\n## Context\n\n## Decision\n\n## Alternatives\n\n## Consequences\n\n## Evidence\n",
  },
];

export function findTemplate(id: string): TemplateDefinition | undefined {
  return builtInTemplates.find((template) => template.id === id);
}

export function workflowTemplateIds(
  workflow: WorkflowDefinition,
): readonly string[] {
  return workflow.steps.map((step) => `${workflow.id}:${step.name}`);
}

export function templateFriendlyIssueTypes(): readonly IssueType[] {
  return [
    "feature",
    "bugfix",
    "refactor",
    "research",
    "investigation",
    "planning",
    "mvp",
    "harness",
    "documentation",
    "decision",
  ];
}

