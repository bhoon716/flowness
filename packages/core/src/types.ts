export const issueTypeValues = [
  "feature",
  "bugfix",
  "review",
  "refactor",
  "research",
  "investigation",
  "planning",
  "mvp",
  "harness",
  "documentation",
  "decision"
] as const;

export type IssueType = (typeof issueTypeValues)[number];

export const issueStateValues = [
  "open",
  "in_progress",
  "blocked",
  "closed"
] as const;

export type IssueState = (typeof issueStateValues)[number];

export const evidenceKindValues = [
  "file",
  "test",
  "review",
  "documentation",
  "decision",
  "command_output"
] as const;

export type EvidenceKind = (typeof evidenceKindValues)[number];

export const reviewRoleValues = [
  "Architecture Reviewer",
  "Correctness Reviewer",
  "Security Reviewer",
  "Test Coverage Reviewer",
  "Maintainability Reviewer",
  "Performance Reviewer",
  "Documentation Reviewer",
] as const;

export type ReviewRole = (typeof reviewRoleValues)[number];

export type GateMode = "always" | "optional" | "never";

export interface EvidenceRecord {
  readonly kind: EvidenceKind;
  readonly title: string;
  readonly detail?: string;
  readonly location?: string;
}

export interface LogEntry {
  readonly timestamp: string;
  readonly step: string;
  readonly actions: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
  readonly summary: string;
  readonly nextStep: string | null;
}

export interface WorkflowState {
  readonly workflowId: string;
  readonly currentStep: string;
  readonly completedSteps: readonly string[];
  readonly failedSteps: readonly string[];
  readonly blocked: boolean;
  readonly updatedAt: string;
  readonly evidence: readonly EvidenceRecord[];
}

export interface WorkflowStepResult {
  readonly summary: string;
  readonly evidence: readonly EvidenceRecord[];
  readonly nextStep?: string | null;
  readonly blocked?: boolean;
}

export interface WorkflowStepContext {
  readonly issueId: string;
  readonly issueType: IssueType;
  readonly workflowId: string;
  readonly stepName: string;
  readonly rootDir: string;
  readonly state: WorkflowState;
}

export interface WorkflowStepDefinition {
  readonly name: string;
  readonly preconditions: readonly string[];
  readonly successConditions: readonly string[];
  readonly execute: (
    context: WorkflowStepContext,
  ) => Promise<WorkflowStepResult> | WorkflowStepResult;
  readonly onFail?: (
    context: WorkflowStepContext,
    error: unknown,
  ) => Promise<WorkflowStepResult> | WorkflowStepResult;
  readonly next?: string | null;
  readonly humanGate?: GateMode;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly WorkflowStepDefinition[];
}

export interface IssueRecord {
  readonly id: string;
  readonly type: IssueType;
  readonly title: string;
  readonly state: IssueState;
  readonly workflowId: string;
  readonly directory: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly logPath: string;
  readonly parentIssueId?: string | null;
  readonly childIssueIds?: readonly string[];
  readonly goal?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly dependencies?: readonly string[];
  readonly evidenceRequired?: readonly string[];
  readonly decompositionFile?: string | null;
}

export interface IssuePlan {
  readonly title: string;
  readonly type: IssueType;
  readonly workflowId: string;
  readonly goal: string;
  readonly acceptanceCriteria: readonly string[];
  readonly dependencies: readonly string[];
  readonly evidenceRequired: readonly string[];
}

export interface IssueDecomposition {
  readonly parentIssueId: string | null;
  readonly parentIssueTitle: string;
  readonly childIssues: readonly IssuePlan[];
}

export interface DecisionDocument {
  readonly id: string;
  readonly issueId: string;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly alternatives: readonly string[];
  readonly consequences: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
  readonly fileName: string;
}

export interface ReviewFinding {
  readonly id: string;
  readonly perspective: ReviewRole;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly filePath: string | null;
  readonly evidence?: readonly EvidenceRecord[];
  readonly problem: string;
  readonly recommendation: string;
  readonly requiresFollowUpIssue: boolean;
  readonly rationale: string;
}

export interface ReviewResult {
  readonly role: ReviewRole;
  readonly status: "pass" | "concern" | "fail";
  readonly summary: string;
  readonly findings: readonly ReviewFinding[];
}

export interface HumanGateConfig {
  readonly clarification: GateMode;
  readonly design: GateMode;
  readonly review: GateMode;
  readonly implementation: GateMode;
}

export interface FlownessProjectConfig {
  readonly projectName: string;
  readonly humanGate: HumanGateConfig;
  readonly defaultWorkflows: Record<IssueType, string>;
  readonly reviewAgents: readonly ReviewRole[];
  readonly documentationRules: {
    readonly appendOnly: boolean;
    readonly preservePromptText: boolean;
  };
}

export interface ScaffoldDirectory {
  readonly path: string;
  readonly description: string;
}

export interface InitializeProjectOptions {
  readonly rootDir: string;
  readonly projectName?: string;
  readonly force?: boolean;
}

export interface InitializeProjectResult {
  readonly rootDir: string;
  readonly projectName: string;
  readonly alreadyInitialized: boolean;
  readonly gitInitialized: boolean;
  readonly warnings: readonly string[];
  readonly createdDirectories: readonly string[];
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
}
