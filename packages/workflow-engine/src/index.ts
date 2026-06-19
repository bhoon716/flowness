import type {
  EvidenceRecord,
  WorkflowDefinition,
  WorkflowState,
  WorkflowStepContext,
  WorkflowStepDefinition,
  WorkflowStepResult,
} from "@flowness-labs/core";
export {
  builtinWorkflowDefinitions,
  createGenericWorkflowDefinition,
  createWorkflowDefinitionFromBlueprint,
  getBuiltinWorkflowDefinition,
  listBuiltinWorkflows,
  renderWorkflowScaffoldSource,
  validateBuiltinWorkflowDefinitions,
} from "./builtins.js";
export type {
  WorkflowBlueprint,
  WorkflowStepBlueprint,
} from "./builtins.js";
export {
  recoverWorkflowStep,
  runWorkflowStep,
} from "./runtime.js";
export {
  runCommitWorkflowStep,
} from "./commit.js";
export {
  loadWorkflowDefinition,
  loadWorkflowDefinitionFromFile,
  loadWorkflowDefinitionFromWorkspace,
} from "./loader.js";

export function defineStep(step: WorkflowStepDefinition): WorkflowStepDefinition {
  if (!step.name.trim()) {
    throw new Error("Workflow step name must not be empty.");
  }

  return {
    ...step,
    preconditions: [...step.preconditions],
    successConditions: [...step.successConditions],
  };
}

export function defineWorkflow(
  workflow: WorkflowDefinition,
): WorkflowDefinition {
  if (!workflow.id.trim()) {
    throw new Error("Workflow id must not be empty.");
  }

  if (workflow.steps.length === 0) {
    throw new Error(`Workflow "${workflow.id}" must contain at least one step.`);
  }

  const names = new Set<string>();
  for (const step of workflow.steps) {
    if (names.has(step.name)) {
      throw new Error(`Workflow "${workflow.id}" contains duplicate step "${step.name}".`);
    }
    names.add(step.name);
  }

  return {
    ...workflow,
    steps: workflow.steps.map((step) => defineStep(step)),
  };
}

export function createInitialWorkflowState(
  workflow: WorkflowDefinition,
  startedAt: string,
): WorkflowState {
  return {
    workflowId: workflow.id,
    currentStep: workflow.steps[0]?.name ?? "",
    completedSteps: [],
    failedSteps: [],
    blocked: false,
    updatedAt: startedAt,
    evidence: [],
  };
}

export function getExpectedWorkflowStep(
  workflow: WorkflowDefinition,
  state: WorkflowState,
): string | null {
  return workflow.steps[state.completedSteps.length]?.name ?? null;
}

export function getNextWorkflowStep(
  workflow: WorkflowDefinition,
  currentStepName: string,
): string | null {
  const currentIndex = workflow.steps.findIndex((step) => step.name === currentStepName);
  if (currentIndex === -1) {
    return null;
  }

  const currentStep = workflow.steps[currentIndex];
  if (currentStep === undefined) {
    return null;
  }

  if (currentStep.next !== undefined) {
    return currentStep.next;
  }

  return workflow.steps[currentIndex + 1]?.name ?? null;
}

export function advanceWorkflowState(
  workflow: WorkflowDefinition,
  state: WorkflowState,
  stepName: string,
  result: WorkflowStepResult,
  updatedAt: string,
): WorkflowState {
  const completedSteps = state.completedSteps.includes(stepName)
    ? [...state.completedSteps]
    : [...state.completedSteps, stepName];

  const failedSteps = result.blocked === true
    ? [...state.failedSteps, stepName]
    : [...state.failedSteps];

  const evidence = [...state.evidence, ...result.evidence];
  const nextStep = result.nextStep ?? getNextWorkflowStep(workflow, stepName) ?? "";

  return {
    workflowId: state.workflowId,
    currentStep: nextStep,
    completedSteps,
    failedSteps,
    blocked: result.blocked === true,
    updatedAt,
    evidence,
  };
}

export function createWorkflowStepContext(input: {
  readonly issueId: string;
  readonly issueType: WorkflowStepContext["issueType"];
  readonly workflowId: string;
  readonly stepName: string;
  readonly rootDir: string;
  readonly state: WorkflowState;
}): WorkflowStepContext {
  return {
    issueId: input.issueId,
    issueType: input.issueType,
    workflowId: input.workflowId,
    stepName: input.stepName,
    rootDir: input.rootDir,
    state: input.state,
  };
}

export function mergeEvidence(
  left: readonly EvidenceRecord[],
  right: readonly EvidenceRecord[],
): readonly EvidenceRecord[] {
  return [...left, ...right];
}
