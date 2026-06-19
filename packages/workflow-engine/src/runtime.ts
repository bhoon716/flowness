import type {
  EvidenceRecord,
  LogEntry,
  WorkflowDefinition,
  WorkflowState,
  WorkflowStepContext,
  WorkflowStepDefinition,
  WorkflowStepResult,
} from "@flowness-labs/core";
import { mergeEvidence, getNextWorkflowStep, defineWorkflow } from "./index.js";
import { pathExists } from "@flowness-labs/core";

export interface WorkflowStepRunInput {
  readonly workflow: WorkflowDefinition;
  readonly state: WorkflowState;
  readonly context: WorkflowStepContext;
  readonly timestamp: string;
  readonly approved?: boolean;
}

export interface WorkflowStepRunOutcome {
  readonly state: WorkflowState;
  readonly logEntry: LogEntry;
  readonly status: "completed" | "blocked" | "waiting_approval";
  readonly nextStep: string | null;
  readonly rootCause?: string;
}

export interface WorkflowFailureOutcome {
  readonly state: WorkflowState;
  readonly logEntry: LogEntry;
  readonly status: "blocked";
  readonly nextStep: string;
  readonly rootCause: string;
}

function normalizeRootCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function ensureCurrentStep(
  state: WorkflowState,
  stepName: string,
): void {
  if (state.currentStep !== stepName) {
    throw new Error(`Workflow step "${stepName}" cannot run while current step is "${state.currentStep}".`);
  }
}

function findStep(
  workflow: WorkflowDefinition,
  stepName: string,
): WorkflowStepDefinition {
  const step = workflow.steps.find((candidate) => candidate.name === stepName);
  if (step === undefined) {
    throw new Error(`Workflow "${workflow.id}" does not define step "${stepName}".`);
  }

  return step;
}

function validateWorkflowState(
  workflow: WorkflowDefinition,
  state: WorkflowState,
): void {
  if (state.workflowId !== workflow.id) {
    throw new Error(`Workflow state belongs to "${state.workflowId}" but workflow "${workflow.id}" was requested.`);
  }

  if (new Set(state.completedSteps).size !== state.completedSteps.length) {
    throw new Error(`Workflow "${workflow.id}" contains duplicate completed steps in state.`);
  }

  if (new Set(state.failedSteps).size !== state.failedSteps.length) {
    throw new Error(`Workflow "${workflow.id}" contains duplicate failed steps in state.`);
  }

  if (state.completedSteps.length > workflow.steps.length) {
    throw new Error(`Workflow "${workflow.id}" cannot have more completed steps than defined steps.`);
  }

  for (let index = 0; index < state.completedSteps.length; index += 1) {
    const expected = workflow.steps[index]?.name;
    const actual = state.completedSteps[index];
    if (expected === undefined || actual !== expected) {
      throw new Error(`Workflow "${workflow.id}" has skipped or out-of-order completed steps.`);
    }
  }

  for (const failedStep of state.failedSteps) {
    if (!workflow.steps.some((step) => step.name === failedStep)) {
      throw new Error(`Workflow "${workflow.id}" contains unknown failed step "${failedStep}".`);
    }
  }

  const expectedCurrentStep = workflow.steps[state.completedSteps.length]?.name ?? "";
  if (state.currentStep !== expectedCurrentStep) {
    throw new Error(`Workflow state is not on the expected step. Expected "${expectedCurrentStep || "complete"}" but found "${state.currentStep || "complete"}".`);
  }

  if (expectedCurrentStep === "" && state.blocked) {
    throw new Error(`Workflow "${workflow.id}" cannot be blocked after completion.`);
  }
}

async function assertStepEvidence(
  stepName: string,
  evidence: readonly EvidenceRecord[],
  requireFileEvidence: boolean,
): Promise<void> {
  if (evidence.length === 0) {
    throw new Error(`Workflow step "${stepName}" must record at least one evidence item.`);
  }

  if (requireFileEvidence && !evidence.some((item) => item.kind === "file")) {
    throw new Error(`Workflow step "${stepName}" must include at least one file evidence item.`);
  }

  for (const item of evidence) {
    if (item.location !== undefined && !(await pathExists(item.location))) {
      throw new Error(`Evidence item "${item.title}" for step "${stepName}" does not exist at "${item.location}".`);
    }
  }
}

function createStepLogEntry(input: {
  readonly timestamp: string;
  readonly stepName: string;
  readonly summary: string;
  readonly actions: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
  readonly nextStep: string | null;
}): LogEntry {
  return {
    timestamp: input.timestamp,
    step: input.stepName,
    actions: [...input.actions],
    evidence: [...input.evidence],
    summary: input.summary,
    nextStep: input.nextStep,
  };
}

export async function runWorkflowStep(
  input: WorkflowStepRunInput,
): Promise<WorkflowStepRunOutcome> {
  const workflow = defineWorkflow(input.workflow);
  validateWorkflowState(workflow, input.state);
  const step = findStep(workflow, input.context.stepName);
  ensureCurrentStep(input.state, step.name);

  if (step.humanGate === "always" && input.approved !== true) {
    const logEntry = createStepLogEntry({
      timestamp: input.timestamp,
      stepName: step.name,
      actions: [
        `Human gate "${step.humanGate}" is pending.`,
        "Step execution paused before running the step implementation.",
      ],
      evidence: [],
      summary: `Awaiting human approval for "${step.name}".`,
      nextStep: step.name,
    });

    return {
      state: {
        ...input.state,
        currentStep: step.name,
        blocked: false,
        updatedAt: input.timestamp,
      },
      logEntry,
      status: "waiting_approval",
      nextStep: step.name,
    };
  }

  try {
    const result = await step.execute(input.context);

    return await finalizeWorkflowStepRun({
      workflow,
      state: input.state,
      step,
      result,
      timestamp: input.timestamp,
      approved: input.approved === true,
    });
  } catch (error) {
    const rootCause = normalizeRootCause(error);
    const failureResult = step.onFail === undefined
      ? {
        summary: `Workflow step "${step.name}" failed: ${rootCause}`,
        evidence: [
          {
            kind: "command_output",
            title: "Failure output",
            detail: rootCause,
          },
        ] as const,
        nextStep: step.name,
        blocked: true,
      }
      : step.onFail(input.context, error);

    if (failureResult instanceof Promise) {
      const awaitedFailureResult = await failureResult;
      return await finalizeWorkflowFailure({
        workflow,
        state: input.state,
        step,
        result: awaitedFailureResult,
        timestamp: input.timestamp,
        rootCause,
      });
    }

    return await finalizeWorkflowFailure({
      workflow,
      state: input.state,
      step,
      result: failureResult,
      timestamp: input.timestamp,
      rootCause,
    });
  }
}

function finalizeWorkflowStepRun(input: {
  readonly workflow: WorkflowDefinition;
  readonly state: WorkflowState;
  readonly step: WorkflowStepDefinition;
  readonly result: WorkflowStepResult;
  readonly timestamp: string;
  readonly approved: boolean;
}): Promise<WorkflowStepRunOutcome> {
  return (async () => {
    await assertStepEvidence(input.step.name, input.result.evidence, true);
    const nextStep = input.result.nextStep ?? getNextWorkflowStep(input.workflow, input.step.name);
    const evidence = mergeEvidence(input.state.evidence, input.result.evidence);
    const approvalEvidence = input.step.humanGate === "always" && input.approved
      ? [{
          kind: "command_output",
          title: `Human approval for ${input.step.name}`,
          detail: `Explicit approval was recorded before "${input.step.name}" completed.`,
        } satisfies EvidenceRecord]
      : [];
    const state: WorkflowState = {
      workflowId: input.state.workflowId,
      currentStep: nextStep ?? "",
      completedSteps: input.state.completedSteps.includes(input.step.name)
        ? [...input.state.completedSteps]
        : [...input.state.completedSteps, input.step.name],
      failedSteps: [...input.state.failedSteps],
      blocked: false,
      updatedAt: input.timestamp,
      evidence,
    };
    const logEntry = createStepLogEntry({
      timestamp: input.timestamp,
      stepName: input.step.name,
      actions: [
        ...(input.step.humanGate === "always" && input.approved
          ? [`Human gate "${input.step.humanGate}" approved explicitly.`]
          : []),
        `Executed step "${input.step.name}".`,
        `Transitioned to "${nextStep ?? "complete"}".`,
      ],
      evidence: [
        ...approvalEvidence,
        ...input.result.evidence,
      ],
      summary: input.result.summary,
      nextStep,
    });

    return {
      state,
      logEntry,
      status: "completed",
      nextStep,
    };
  })();
}

function finalizeWorkflowFailure(input: {
  readonly workflow: WorkflowDefinition;
  readonly state: WorkflowState;
  readonly step: WorkflowStepDefinition;
  readonly result: WorkflowStepResult;
  readonly timestamp: string;
  readonly rootCause: string;
}): Promise<WorkflowFailureOutcome> {
  return (async () => {
    await assertStepEvidence(input.step.name, input.result.evidence, false);
    const evidence = mergeEvidence(input.state.evidence, input.result.evidence);
    const nextStep = input.step.name;
    const state: WorkflowState = {
      workflowId: input.state.workflowId,
      currentStep: nextStep,
      completedSteps: [...input.state.completedSteps],
      failedSteps: input.state.failedSteps.includes(input.step.name)
        ? [...input.state.failedSteps]
        : [...input.state.failedSteps, input.step.name],
      blocked: true,
      updatedAt: input.timestamp,
      evidence: [
        ...evidence,
        {
          kind: "command_output",
          title: `Failure root cause for ${input.step.name}`,
          detail: input.rootCause,
        },
      ],
    };

    const logEntry = createStepLogEntry({
      timestamp: input.timestamp,
      stepName: input.step.name,
      actions: [
        `Step "${input.step.name}" failed.`,
        `Root cause: ${input.rootCause}`,
        `Returning to "${nextStep}" for recovery.`,
      ],
      evidence: [
        ...input.result.evidence,
        {
          kind: "command_output",
          title: `Root cause: ${input.step.name}`,
          detail: input.rootCause,
        },
      ],
      summary: input.result.summary,
      nextStep,
    });

    return {
      state,
      logEntry,
      status: "blocked",
      nextStep,
      rootCause: input.rootCause,
    };
  })();
}

export async function recoverWorkflowStep(
  input: WorkflowStepRunInput & { readonly rootCause: string },
): Promise<WorkflowFailureOutcome> {
  const workflow = defineWorkflow(input.workflow);
  validateWorkflowState(workflow, input.state);
  const step = findStep(workflow, input.context.stepName);
  ensureCurrentStep(input.state, step.name);

  const recoveryLog = createStepLogEntry({
    timestamp: input.timestamp,
    stepName: step.name,
    actions: [
      `Recovering step "${step.name}".`,
      `Root cause: ${input.rootCause}`,
    ],
    evidence: [
      {
        kind: "command_output",
        title: `Recovery root cause: ${step.name}`,
        detail: input.rootCause,
      },
    ],
    summary: `Recovery loop prepared for "${step.name}".`,
    nextStep: step.name,
  });

    return {
      state: {
        ...input.state,
        currentStep: step.name,
        blocked: true,
      updatedAt: input.timestamp,
      failedSteps: input.state.failedSteps.includes(step.name)
        ? [...input.state.failedSteps]
        : [...input.state.failedSteps, step.name],
      evidence: [
        ...input.state.evidence,
        {
          kind: "command_output",
          title: `Recovery root cause: ${step.name}`,
          detail: input.rootCause,
        },
      ],
      },
      logEntry: recoveryLog,
      status: "blocked",
      nextStep: step.name,
      rootCause: input.rootCause,
    };
  }
