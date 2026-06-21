import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  pathExists,
  readJsonFile,
  sha256Hex,
} from "./filesystem.js";
import {
  buildContextIndex,
} from "./context-index.js";

export interface ScaffoldArtifact {
  readonly path: string;
  readonly content: string;
}

export interface GeneratedFileHashes {
  readonly [path: string]: string;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

export interface ProjectAnalysis {
  readonly rootDir: string;
  readonly projectName: string;
  readonly packageManager: PackageManager;
  readonly language: string;
  readonly framework: string;
  readonly buildCommand: string | null;
  readonly testCommand: string | null;
  readonly lintCommand: string | null;
  readonly sourceDirectories: readonly string[];
  readonly documentationPaths: readonly string[];
  readonly gitStatus: string;
  readonly packageJsonPath: string | null;
  readonly notes: readonly string[];
}

interface PackageJsonShape {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface WorkflowStepSpec {
  readonly fileName: string;
  readonly title: string;
  readonly purpose: string;
  readonly humanGate: "always" | "optional" | "never";
  readonly next?: string | null;
}

interface WorkflowSpec {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly focus: string;
  readonly steps: readonly WorkflowStepSpec[];
}

const workflowSpecs: readonly WorkflowSpec[] = [
  {
    id: "feature-development",
    title: "Feature Development",
    summary: "Ship a feature with explicit clarification, implementation, evidence, review, and closure.",
    focus: "feature work",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the request, the project context, and whether the work should become an issue.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask for the missing requirements and log assumptions before implementation starts.", humanGate: "always", next: "Requirement Analysis" },
      { fileName: "03-requirement-analysis.md", title: "Requirement Analysis", purpose: "Identify the users, problem, goals, constraints, and risks behind the request.", humanGate: "always", next: "Scope Definition" },
      { fileName: "04-scope-definition.md", title: "Scope Definition", purpose: "Draw the line around the requested work and call out the non-goals.", humanGate: "always", next: "Implementation" },
      { fileName: "05-implementation.md", title: "Implementation", purpose: "Make the code or documentation change using the confirmed plan.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Run the relevant commands and collect proof that the change works.", humanGate: "optional", next: "Commit" },
      { fileName: "07-commit.md", title: "Commit", purpose: "Inspect git state, stage the intended files, and create the final commit.", humanGate: "never", next: "Close" },
      { fileName: "08-close.md", title: "Close", purpose: "Summarize the final state, remaining risks, and any follow-up work.", humanGate: "never", next: null },
    ],
  },
  {
    id: "code-review",
    title: "Code Review",
    summary: "Review a change set, confirm the target, inspect the diff, gather multi-perspective findings, and close with a recommendation.",
    focus: "diff-focused review work",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the review request and the change set under review.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask for the review target, review bar, and any missing context before reviewing.", humanGate: "always", next: "Scope Definition" },
      { fileName: "03-scope-definition.md", title: "Scope Definition", purpose: "Define what is in scope, what is out of scope, and what evidence matters.", humanGate: "always", next: "Diff Review" },
      { fileName: "04-diff-review.md", title: "Diff Review", purpose: "Summarize the target diff and affected files before deeper review.", humanGate: "always", next: "Findings Synthesis" },
      { fileName: "05-findings-synthesis.md", title: "Findings Synthesis", purpose: "Turn architecture, correctness, security, test coverage, and maintainability observations into compact findings.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Check that every finding points to concrete evidence and note whether a follow-up issue is needed.", humanGate: "optional", next: "Commit" },
      { fileName: "07-commit.md", title: "Commit", purpose: "Inspect git state, stage the intended files, and create the final commit.", humanGate: "never", next: "Close" },
      { fileName: "08-close.md", title: "Close", purpose: "Close the review with a clear recommendation or follow-up issue list.", humanGate: "never", next: null },
    ],
  },
  {
    id: "bug-fix",
    title: "Bug Fix",
    summary: "Diagnose a defect, clarify the failure, fix it, and verify the result.",
    focus: "bug fixes and regressions",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the bug report, environment, and user impact.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask for reproduction steps, expected behavior, and affected scope.", humanGate: "always", next: "Reproduction" },
      { fileName: "03-reproduction.md", title: "Reproduction", purpose: "Reproduce the failure and log the exact conditions that trigger it.", humanGate: "always", next: "Root Cause Analysis" },
      { fileName: "04-root-cause-analysis.md", title: "Root Cause Analysis", purpose: "Identify the source of the failure and document the supporting evidence.", humanGate: "always", next: "Fix" },
      { fileName: "05-fix.md", title: "Fix", purpose: "Implement the smallest safe change that resolves the bug.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Verify the fix with tests or other concrete evidence.", humanGate: "optional", next: "Commit" },
      { fileName: "07-commit.md", title: "Commit", purpose: "Inspect git state, stage the intended files, and create the final commit.", humanGate: "never", next: "Close" },
      { fileName: "08-close.md", title: "Close", purpose: "Summarize the fix, the verification, and any residual risk.", humanGate: "never", next: null },
    ],
  },
  {
    id: "refactoring",
    title: "Refactoring",
    summary: "Improve structure and maintainability without widening the scope.",
    focus: "refactoring work",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the refactoring request and the code area to change.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask about behavioral constraints, risk tolerance, and success criteria.", humanGate: "always", next: "Impact Analysis" },
      { fileName: "03-impact-analysis.md", title: "Impact Analysis", purpose: "Identify the modules, dependencies, and risks that the refactor will touch.", humanGate: "always", next: "Scope Definition" },
      { fileName: "04-scope-definition.md", title: "Scope Definition", purpose: "Define the smallest refactor that still delivers the improvement.", humanGate: "always", next: "Refactor Plan" },
      { fileName: "05-refactor-plan.md", title: "Refactor Plan", purpose: "Lay out the steps and file boundaries for the refactor.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Verify that behavior remains stable after the refactor.", humanGate: "optional", next: "Commit" },
      { fileName: "07-commit.md", title: "Commit", purpose: "Inspect git state, stage the intended files, and create the final commit.", humanGate: "never", next: "Close" },
      { fileName: "08-close.md", title: "Close", purpose: "Summarize the maintainability improvement and any follow-up work.", humanGate: "never", next: null },
    ],
  },
  {
    id: "mvp-planning",
    title: "MVP Planning",
    summary: "Identify the problem, clarify the requirements, review the plan, and only then break out development issues.",
    focus: "MVP planning",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the product request, the users, and the problem statement.", humanGate: "always", next: "Requirement Analysis" },
      { fileName: "02-requirement-analysis.md", title: "Requirement Analysis", purpose: "Identify the users, problem, goals, constraints, and risks.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "03-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask the missing questions and log assumptions before the plan is written.", humanGate: "always", next: "Scope Definition" },
      { fileName: "04-scope-definition.md", title: "Scope Definition", purpose: "Define the MVP scope, the non-goals, and the acceptance criteria.", humanGate: "always", next: "MVP Plan" },
      { fileName: "05-mvp-plan.md", title: "MVP Plan", purpose: "Write the minimal plan that aligns the team on the first version.", humanGate: "always", next: "Plan Review" },
      { fileName: "06-plan-review.md", title: "Plan Review", purpose: "Review the plan before any development issues are generated.", humanGate: "always", next: "Issue Breakdown" },
      { fileName: "07-issue-breakdown.md", title: "Issue Breakdown", purpose: "Split the reviewed plan into child issues with clear goals and evidence requirements.", humanGate: "always", next: "Commit" },
      { fileName: "08-commit.md", title: "Commit", purpose: "Inspect git state, stage the intended files, and create the final commit.", humanGate: "never", next: "Close" },
      { fileName: "09-close.md", title: "Close", purpose: "Record the final plan state, risks, and the next delivery step.", humanGate: "never", next: null },
    ],
  },
];

export interface ActiveIssueNavigationContext {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly issueState: string;
  readonly workflowId: string;
  readonly currentStep: string;
  readonly nextStep: string | null;
  readonly blocked: boolean;
  readonly blockReason: string | null;
  readonly pendingStep: string | null;
  readonly requiredAction: string | null;
  readonly issueFile: string;
  readonly workflowStateFile: string;
  readonly issueLogFile: string;
  readonly currentStepFile: string;
  readonly nextStepFile: string | null;
  readonly evidenceFiles: readonly string[];
  readonly relevantRules: readonly string[];
}

interface TechRuleSpec {
  readonly fileName: string;
  readonly title: string;
  readonly intro: string;
  readonly architecture: readonly string[];
  readonly conventions: readonly string[];
  readonly bestPractices: readonly string[];
  readonly antiPatterns: readonly string[];
  readonly cleanCode: readonly string[];
  readonly solid: readonly string[];
  readonly testing: readonly string[];
  readonly security: readonly string[];
}

const genericArchitectureBullets = [
  "Keep boundaries explicit and make the main dependency direction obvious.",
  "Favor feature or domain slices over large technical dumping grounds.",
  "Push framework and I/O concerns to the edges behind narrow adapters.",
] as const;

const genericCodingConventionBullets = [
  "Use the project's formatter and linter as the final source of style truth.",
  "Prefer descriptive names and small files over broad, catch-all modules.",
  "Keep public APIs narrow and keep helper code close to the code that uses it.",
] as const;

const genericBestPracticeBullets = [
  "Validate input at the boundary and convert it into typed domain data early.",
  "Prefer dependency injection or explicit composition over hidden globals.",
  "Keep side effects easy to spot and isolate them from pure logic.",
] as const;

const genericAntiPatternBullets = [
  "Avoid God objects, shared mutable state, and utility buckets that hold everything.",
  "Avoid mixing transport, orchestration, and persistence concerns in the same class or file.",
  "Avoid abstractions that add indirection without removing duplication or coupling.",
] as const;

const genericCleanCodeBullets = [
  "Keep functions short and single-purpose.",
  "Name things for business intent rather than implementation detail.",
  "Prefer small refactors that make the change easier to test and review.",
] as const;

const genericSolidBullets = [
  "Keep responsibilities separated so one change does not ripple through unrelated code.",
  "Depend on abstractions at the edges, but do not invent interfaces for trivial internals.",
  "Prefer composition and small collaborators over inheritance-heavy designs.",
] as const;

const genericTestingBullets = [
  "Cover the happy path and the boundary failures closest to the user-facing surface.",
  "Prefer tests that exercise public behavior over tests that mirror implementation details.",
  "Use integration coverage where cross-layer behavior or regressions matter most.",
] as const;

const genericSecurityBullets = [
  "Treat external input as untrusted and validate it before it reaches business logic.",
  "Keep secrets out of source control and load them from environment or secret storage.",
  "Review auth, authorization, and data exposure whenever a new boundary is added.",
] as const;

const techRuleSpecs: readonly TechRuleSpec[] = [
  {
    fileName: "java.md",
    title: "Java",
    intro: "Java projects should lean on package structure, strong encapsulation, and explicit dependency boundaries.",
    architecture: [
      ...genericArchitectureBullets,
      "Use packages to express domain boundaries and keep classes cohesive.",
      "Use records or small immutable types for simple data transfer objects.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Prefer constructor-based initialization and keep field visibility tight.",
      "Use final where it meaningfully prevents accidental mutation.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Prefer interfaces at real seams and keep implementations behind those seams.",
      "Use Optional for absent values at boundaries, not as a field type everywhere.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid field injection, static mutable state, and giant service classes.",
      "Avoid catch-and-ignore error handling that hides the real failure mode.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep methods small enough that intent is visible without scrolling.",
      "Let packages and class names communicate the main responsibility.",
    ],
    solid: [
      ...genericSolidBullets,
      "Keep services focused on one reason to change and split responsibilities when they drift.",
      "Prefer dependency inversion at integration boundaries rather than across every internal helper.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use JUnit for unit tests and add integration tests for IO, persistence, and wiring.",
      "Use focused tests around constructors, validation, and error paths.",
    ],
    security: [
      ...genericSecurityBullets,
      "Avoid unsafe deserialization and reflectively loading untrusted classes or names.",
      "Validate request data before it reaches persistence or remote calls.",
    ],
  },
  {
    fileName: "javascript.md",
    title: "JavaScript",
    intro: "JavaScript code should be explicit about modules, async boundaries, and side effects.",
    architecture: [
      ...genericArchitectureBullets,
      "Prefer ESM modules and keep the module graph easy to follow.",
      "Separate pure logic from DOM, network, and filesystem access.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Prefer const by default and use let only when mutation is required.",
      "Keep async functions explicit and avoid callback nesting when a promise is enough.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Handle promise rejection and thrown errors at the boundary that can actually recover.",
      "Keep state local unless there is a clear shared ownership model.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid eval, dynamic code loading from untrusted input, and prototype mutation.",
      "Avoid callback pyramids, hidden globals, and modules that do too many jobs.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep data transforms obvious and return plain values when possible.",
      "Use small helpers instead of one giant utility file.",
    ],
    solid: [
      ...genericSolidBullets,
      "Apply single responsibility at the module level and keep class hierarchies shallow.",
      "Prefer composition and dependency injection for behavior that changes by environment.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use unit and integration tests that exercise public functions and user-visible behavior.",
      "Stub external systems at the edge and keep test fixtures small.",
    ],
    security: [
      ...genericSecurityBullets,
      "Sanitize user-controlled HTML and avoid injecting untrusted strings into the DOM.",
      "Validate JSON and request payloads before they reach business logic or persistence.",
    ],
  },
  {
    fileName: "typescript.md",
    title: "TypeScript",
    intro: "TypeScript code should use types to clarify boundaries, not to obscure implementation.",
    architecture: [
      ...genericArchitectureBullets,
      "Keep strongly typed boundaries around API input, output, and persistence records.",
      "Prefer domain-specific types and feature slices over giant shared type bags.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Use strict compiler settings and treat type errors as design feedback.",
      "Use interfaces and type aliases intentionally instead of by habit.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Use discriminated unions for state machines and request/result shapes.",
      "Use `satisfies` and precise return types to keep widening under control.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid `any`, `as unknown as`, and other escape hatches unless you can justify them.",
      "Avoid types so abstract that they no longer protect the code at runtime boundaries.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep type names aligned with the domain concept they represent.",
      "Prefer a small number of expressive types over a large hierarchy of near-duplicates.",
    ],
    solid: [
      ...genericSolidBullets,
      "Use abstraction when it lowers coupling at an external boundary, not everywhere internally.",
      "Prefer composable services and small interfaces that describe one capability.",
    ],
    testing: [
      ...genericTestingBullets,
      "Combine type-checking with runtime tests so both compile-time and behavior regressions are caught.",
      "Test the public API and the conversion points where raw data becomes typed data.",
    ],
    security: [
      ...genericSecurityBullets,
      "Remember that static types do not validate untrusted input at runtime.",
      "Validate request payloads and file contents before turning them into typed domain objects.",
    ],
  },
  {
    fileName: "python.md",
    title: "Python",
    intro: "Python code should stay readable, explicit, and close to the project conventions around imports, modules, and exceptions.",
    architecture: [
      ...genericArchitectureBullets,
      "Use modules and packages to express domain boundaries and keep import graphs simple.",
      "Prefer small collaborating functions and dataclasses over excessive inheritance.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Follow PEP 8 and keep imports, naming, and line length consistent with project policy.",
      "Prefer pathlib, context managers, and explicit exception handling.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Add type hints where they clarify a public boundary or a tricky data shape.",
      "Make side effects explicit and keep module import time cheap.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid broad except blocks, module-level mutable state, and import-time work.",
      "Avoid turning utility modules into a dumping ground for unrelated helpers.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep functions small and let the code read top-to-bottom like a narrative.",
      "Use docstrings where they clarify the contract, not every obvious implementation detail.",
    ],
    solid: [
      ...genericSolidBullets,
      "Keep class responsibilities narrow and favor composition over deep inheritance trees.",
      "Use dependency injection or explicit parameters when a behavior might vary.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use pytest or unittest to cover the boundary behavior and the key error paths.",
      "Prefer fixtures that are small and explicit rather than magical shared state.",
    ],
    security: [
      ...genericSecurityBullets,
      "Do not trust file contents, subprocess inputs, or environment values without validation.",
      "Keep secrets in environment variables or secret stores and avoid committing them.",
    ],
  },
  {
    fileName: "spring.md",
    title: "Spring",
    intro: "Spring applications should keep controllers thin, services focused, and cross-cutting concerns explicit.",
    architecture: [
      ...genericArchitectureBullets,
      "Organize code by domain or bounded context, not only by technical layer.",
      "Keep controllers, services, repositories, and configuration classes clearly separated.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Prefer constructor injection and explicit configuration over field injection.",
      "Keep transaction boundaries and validation annotations visible in the class that owns them.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Keep controllers thin and move orchestration into services.",
      "Use DTOs at the edge and keep persistence entities separate from API shape where it helps clarity.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid field injection, controller business logic, and sprawling transaction scopes.",
      "Avoid treating repositories like services or services like controllers.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep class names and package names aligned with the domain they own.",
      "Make service methods tell the story of the use case rather than the framework callback.",
    ],
    solid: [
      ...genericSolidBullets,
      "Use interfaces where they describe a real external seam or variation point.",
      "Keep each bean responsible for one change reason and one clear collaboration.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use unit tests for services and slice or integration tests for wiring, validation, and persistence.",
      "Use MockMvc, WebTestClient, or Testcontainers when those boundaries matter.",
    ],
    security: [
      ...genericSecurityBullets,
      "Use Spring Security for authentication and authorization instead of ad hoc checks.",
      "Validate inputs, keep secrets out of code, and review serialization and deserialization paths carefully.",
    ],
  },
  {
    fileName: "react.md",
    title: "React",
    intro: "React code should favor feature-based organization, small pure components, and predictable data flow.",
    architecture: [
      ...genericArchitectureBullets,
      "Group components, hooks, tests, and styles by feature slice when that improves locality.",
      "Keep shared primitives small and reserve global state for genuinely shared concerns.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Keep components pure and put side effects into the smallest possible effect boundary.",
      "Use hooks at the top level and keep render logic readable without premature memoization.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Co-locate state with the smallest component that owns it.",
      "Prefer composition over inheritance and prefer props over unnecessary context.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid large shared components that absorb unrelated feature behavior.",
      "Avoid overusing context, effects, or memoization to solve problems that simpler state would solve.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep component props small and descriptive.",
      "Make custom hooks do one thing and name them after the behavior they encapsulate.",
    ],
    solid: [
      ...genericSolidBullets,
      "Separate UI rendering from business logic so components stay easy to test.",
      "Favor composition and small feature slices over inheritance or deeply nested prop plumbing.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use React Testing Library to verify behavior through the user-facing surface.",
      "Test the critical interactions and the rendering branches that matter to users.",
    ],
    security: [
      ...genericSecurityBullets,
      "Avoid unsafe HTML injection and sanitize any rich text or user-generated content before rendering it.",
      "Keep secrets and sensitive logic off the client when the server can own them.",
    ],
  },
  {
    fileName: "nextjs.md",
    title: "Next.js",
    intro: "Next.js code should lean on the App Router, server components, and explicit client boundaries.",
    architecture: [
      ...genericArchitectureBullets,
      "Prefer server components by default and opt into client components only when interactivity requires them.",
      "Keep route segments, data fetching, and mutations close to the feature or route that uses them.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Keep routing files small and let the route structure reflect the product structure.",
      "Make caching, loading, and error boundaries explicit in route code.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Fetch data on the server when that reduces client complexity or protects secrets.",
      "Keep form submission, auth, and mutation logic on the server side when practical.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid turning the whole app into client components just to simplify one interaction.",
      "Avoid mixing server-only code, client-only code, and UI concerns in the same module when a boundary is clearer.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep route components small and compose them from feature-level helpers.",
      "Name route files and co-located helpers after the user-facing feature they serve.",
    ],
    solid: [
      ...genericSolidBullets,
      "Treat route handlers and server helpers as small boundaries with one responsibility.",
      "Prefer small composable data access helpers over broad shared abstractions.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use integration tests and e2e tests for routing, auth, and server/client boundaries that can regress easily.",
      "Use component tests for isolated UI behavior and route segment boundaries.",
    ],
    security: [
      ...genericSecurityBullets,
      "Keep secrets and privileged logic on the server and never bundle them into client components.",
      "Validate request data and auth decisions at the route or server-action boundary.",
    ],
  },
  {
    fileName: "nestjs.md",
    title: "NestJS",
    intro: "NestJS code should follow module boundaries, dependency injection, and explicit validation.",
    architecture: [
      ...genericArchitectureBullets,
      "Organize code around modules, controllers, providers, and feature boundaries.",
      "Keep transport concerns in controllers and business rules in providers or services.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Prefer constructor injection and typed DTOs over manual request parsing.",
      "Keep guards, pipes, and interceptors explicit where cross-cutting concerns belong.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Use validation pipes and DTOs to normalize input at the edge.",
      "Keep controllers thin and let services orchestrate collaborators.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid fat controllers, hidden globals, and ad hoc request parsing.",
      "Avoid mixing validation, orchestration, and persistence inside one method.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep providers small and name them after one domain responsibility.",
      "Export only what downstream modules truly need.",
    ],
    solid: [
      ...genericSolidBullets,
      "Use module exports and interfaces to keep dependency direction clear.",
      "Split providers when a class starts serving more than one reason to change.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use unit tests for providers and integration or e2e tests for module boundaries and transport behavior.",
      "Test validation, guards, and serialization paths that often fail silently.",
    ],
    security: [
      ...genericSecurityBullets,
      "Use guards and validation pipes for auth and input safety instead of hand-rolled checks everywhere.",
      "Treat DTOs and serialization boundaries as security-sensitive surfaces.",
    ],
  },
  {
    fileName: "django.md",
    title: "Django",
    intro: "Django code should keep apps cohesive, views thin, and validation close to the model or form boundary.",
    architecture: [
      ...genericArchitectureBullets,
      "Organize the project by Django app or domain area instead of only by technical type.",
      "Keep models, forms, views, and templates separated so each layer stays easy to reason about.",
    ],
    conventions: [
      ...genericCodingConventionBullets,
      "Keep views small and let forms or serializers own input validation where it fits the workflow.",
      "Use settings modules and environment-specific configuration intentionally.",
    ],
    bestPractices: [
      ...genericBestPracticeBullets,
      "Prefer ORM queries and migrations over raw SQL unless there is a good reason not to.",
      "Keep reusable domain logic out of templates and lean on services or model methods where helpful.",
    ],
    antiPatterns: [
      ...genericAntiPatternBullets,
      "Avoid fat views, template logic sprawl, and direct database access everywhere.",
      "Avoid treating Django apps as catch-all folders that own unrelated features.",
    ],
    cleanCode: [
      ...genericCleanCodeBullets,
      "Keep app names and model names aligned with the business domain.",
      "Use clear view names and keep template logic readable to non-framework specialists.",
    ],
    solid: [
      ...genericSolidBullets,
      "Keep each Django app focused on one domain concept or bounded capability.",
      "Split heavy workflows into services, forms, or model methods so responsibilities stay narrow.",
    ],
    testing: [
      ...genericTestingBullets,
      "Use Django's test tools or pytest to cover request/response behavior and ORM interactions.",
      "Prefer integration coverage for forms, views, and security-sensitive paths.",
    ],
    security: [
      ...genericSecurityBullets,
      "Keep CSRF, auth, permissions, and template escaping in mind whenever you touch a request path.",
      "Use the ORM and built-in security features instead of rolling custom parsing or auth logic.",
    ],
  },
];

function artifact(path: string, content: string): ScaffoldArtifact {
  return { path, content };
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeScriptCommand(packageManager: PackageManager, scriptName: string): string | null {
  switch (packageManager) {
    case "npm":
      return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
    case "pnpm":
      return scriptName === "test" ? "pnpm test" : `pnpm ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    case "unknown":
      return null;
  }
}

function detectPackageManager(files: readonly string[]): PackageManager {
  if (files.includes("bun.lockb") || files.includes("bun.lock")) {
    return "bun";
  }
  if (files.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (files.includes("yarn.lock")) {
    return "yarn";
  }
  if (files.includes("package-lock.json")) {
    return "npm";
  }
  if (files.includes("package.json")) {
    return "npm";
  }
  return "unknown";
}

function detectLanguage(packageJson: PackageJsonShape | null, files: readonly string[]): string {
  if (files.includes("pyproject.toml") || files.includes("requirements.txt")) {
    return "Python";
  }

  if (files.includes("go.mod")) {
    return "Go";
  }

  if (files.includes("pom.xml") || files.includes("build.gradle") || files.includes("build.gradle.kts")) {
    return "Java";
  }

  if (files.includes("Cargo.toml")) {
    return "Rust";
  }

  if (packageJson !== null) {
    if (files.includes("tsconfig.json") || hasDependency(packageJson, "typescript")) {
      return "TypeScript";
    }

    return "JavaScript";
  }

  if (files.some((file) => /\.(ts|tsx)$/.test(file))) {
    return "TypeScript";
  }

  if (files.some((file) => /\.(js|jsx|mjs|cjs)$/.test(file))) {
    return "JavaScript";
  }

  return "Unknown";
}

function hasDependency(packageJson: PackageJsonShape, dependencyName: string): boolean {
  const dependencyGroups = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
  ];

  return dependencyGroups.some((group) => group !== undefined && dependencyName in group);
}

function detectFramework(packageJson: PackageJsonShape | null, files: readonly string[]): string {
  const dependencyNames = new Set<string>();
  if (packageJson !== null) {
    for (const group of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
      for (const name of Object.keys(group ?? {})) {
        dependencyNames.add(name);
      }
    }
  }

  if (dependencyNames.has("next") || files.some((file) => /^next\.config\./.test(file))) {
    return "Next.js";
  }

  if (dependencyNames.has("react") || dependencyNames.has("react-dom")) {
    return "React";
  }

  if (dependencyNames.has("vue")) {
    return "Vue";
  }

  if (dependencyNames.has("svelte")) {
    return "Svelte";
  }

  if (dependencyNames.has("@nestjs/core")) {
    return "NestJS";
  }

  if (dependencyNames.has("express")) {
    return "Express";
  }

  if (files.includes("pyproject.toml")) {
    return "Python";
  }

  if (files.includes("Cargo.toml")) {
    return "Rust";
  }

  return packageJson === null ? "Unknown" : "Node.js";
}

function renderCommandLine(label: string, command: string | null): string {
  return command === null ? `${label}: TODO: detect a command.` : `${label}: \`${command}\``;
}

function renderList(label: string, values: readonly string[]): string {
  if (values.length === 0) {
    return `${label}: TODO: detect`;
  }

  return [
    `${label}:`,
    ...values.map((value) => `- ${value}`),
  ].join("\n");
}

function renderProjectNotes(notes: readonly string[]): string {
  if (notes.length === 0) {
    return "- No major uncertainty detected.";
  }

  return notes.map((note) => `- ${note}`).join("\n");
}

function renderBulletedSection(title: string, bullets: readonly string[]): string[] {
  return [
    title,
    ...bullets.map((bullet) => `- ${bullet}`),
    "",
  ];
}

function renderMarkdownLink(label: string, target: string): string {
  return `[${label}](${target})`;
}

interface RuleDocumentSpec {
  readonly title: string;
  readonly ruleId: string;
  readonly scope: string;
  readonly policy: readonly string[];
  readonly examples: readonly string[];
  readonly lastUpdated: string;
  readonly notes?: readonly string[];
}

function renderRuleDocumentMarkdown(spec: RuleDocumentSpec): string {
  return [
    `# ${spec.title}`,
    "",
    `- Rule ID: ${spec.ruleId}`,
    "",
    "## Scope",
    spec.scope,
    "",
    "## Policy",
    ...spec.policy.map((line) => `- ${line}`),
    "",
    "## Examples",
    ...spec.examples.map((line) => `- ${line}`),
    "",
    "## Last Updated",
    `- ${spec.lastUpdated}`,
    ...(spec.notes === undefined || spec.notes.length === 0
      ? []
      : [
          "",
          "## Notes",
          ...spec.notes.map((line) => `- ${line}`),
        ]),
    "",
  ].join("\n");
}

function stripFlownessPrefix(path: string): string {
  return path.startsWith(".flowness/")
    ? path.slice(".flowness/".length)
    : path;
}

function deriveRelevantTechRuleFiles(analysis: ProjectAnalysis): readonly string[] {
  const files = new Set<string>();

  switch (analysis.language) {
    case "Java":
      files.add("tech/java.md");
      break;
    case "Python":
      files.add("tech/python.md");
      break;
    case "JavaScript":
      files.add("tech/javascript.md");
      break;
    case "TypeScript":
      files.add("tech/typescript.md");
      files.add("tech/javascript.md");
      break;
  }

  switch (analysis.framework) {
    case "React":
      files.add("tech/react.md");
      break;
    case "Next.js":
      files.add("tech/nextjs.md");
      files.add("tech/react.md");
      break;
    case "NestJS":
      files.add("tech/nestjs.md");
      break;
    case "Spring":
      files.add("tech/spring.md");
      break;
    case "Django":
      files.add("tech/django.md");
      break;
  }

  return [...files].sort();
}

function deriveRelevantRuleFiles(analysis: ProjectAnalysis): readonly string[] {
  const generalRules = [
    "request-analysis.md",
    "clarification-policy.md",
    "issue-decomposition.md",
    "fail-closed-workflow.md",
    "flowness-activation.md",
    "workflow-routing.md",
    "definition-of-done.md",
    "evidence-policy.md",
    "performance-improvement.md",
    "git.md",
    "commit-policy.md",
    "workflow-step-contract.md",
    "project-overrides.md",
    "rule-update-log.md",
  ];

  return [
    ...generalRules.map((file) => `.flowness/rules/${file}`),
    ...deriveRelevantTechRuleFiles(analysis).map((file) => `.flowness/rules/${file}`),
  ];
}

function renderTechRuleMarkdown(spec: TechRuleSpec, analysis: ProjectAnalysis): string {
  const stackLabel = analysis.framework === "Unknown"
    ? analysis.language
    : `${analysis.language} / ${analysis.framework}`;

  return [
    `# ${spec.title}`,
    "",
    `- Project: ${analysis.projectName}`,
    `- Stack: ${stackLabel}`,
    `- Package manager: ${analysis.packageManager}`,
    analysis.buildCommand === null ? "- Build: TODO: detect build command." : `- Build: \`${analysis.buildCommand}\``,
    analysis.testCommand === null ? "- Test: TODO: detect test command." : `- Test: \`${analysis.testCommand}\``,
    analysis.lintCommand === null ? "- Lint: TODO: detect lint command." : `- Lint: \`${analysis.lintCommand}\``,
    "",
    "## Common Architecture",
    ...spec.architecture.map((item) => `- ${item}`),
    "",
    "## Coding Conventions",
    ...spec.conventions.map((item) => `- ${item}`),
    "",
    "## Best Practices",
    ...spec.bestPractices.map((item) => `- ${item}`),
    "",
    "## Anti-Patterns",
    ...spec.antiPatterns.map((item) => `- ${item}`),
    "",
    "## Clean Code Rules",
    ...spec.cleanCode.map((item) => `- ${item}`),
    "",
    "## SOLID Guidance",
    ...spec.solid.map((item) => `- ${item}`),
    "",
    "## Testing Guidance",
    ...spec.testing.map((item) => `- ${item}`),
    "",
    "## Security Notes",
    ...spec.security.map((item) => `- ${item}`),
    "",
    "## Project-Specific Overrides",
    `- [Project overrides](../project-overrides.md)`,
    `- [Rule update log](../rule-update-log.md)`,
    "",
    "## Notes",
    spec.intro,
    "",
  ].join("\n");
}

function renderPlanningDocMarkdown(input: {
  readonly title: string;
  readonly intro: string;
  readonly summary: string;
  readonly sections: readonly { readonly title: string; readonly bullets: readonly string[] }[];
  readonly links: readonly string[];
}): string {
  return [
    `# ${input.title}`,
    "",
    input.intro,
    "",
    "## Summary",
    input.summary,
    "",
    ...input.sections.flatMap((section) => renderBulletedSection(section.title, section.bullets)),
    "## Related Files",
    ...input.links.map((link) => `- ${link}`),
    "",
  ].join("\n");
}

function renderNavigationMarkdown(
  analysis: ProjectAnalysis,
  activeIssue: ActiveIssueNavigationContext | null,
): string {
  const relevantRules = deriveRelevantRuleFiles(analysis);
  const readFirstLinks = activeIssue === null
    ? [
        renderMarkdownLink("project-profile.md", "project-profile.md"),
        renderMarkdownLink("context-index.json", "context-index.json"),
        renderMarkdownLink("commands.json", "commands.json"),
        renderMarkdownLink("harness-manifest.json", "harness-manifest.json"),
        renderMarkdownLink("state/active-issue.md", "state/active-issue.md"),
      ]
    : [
        renderMarkdownLink("issue.md", `issues/${activeIssue.issueId}/issue.md`),
        renderMarkdownLink("workflow-state.json", `issues/${activeIssue.issueId}/workflow-state.json`),
        renderMarkdownLink("issue log", `logs/${activeIssue.issueId}.md`),
        renderMarkdownLink(activeIssue.currentStepFile, `workflows/${activeIssue.workflowId}/${activeIssue.currentStepFile}`),
      ];
  const activeIssueLabel = activeIssue === null
    ? "none yet"
    : activeIssue.blocked
      ? `blocked: ${activeIssue.blockReason ?? "approval required"}`
      : "ready";
  const relevantRuleLinks = relevantRules.slice(0, 6).map((rulePath) => {
    const relativeRulePath = stripFlownessPrefix(rulePath);
    return renderMarkdownLink(relativeRulePath, relativeRulePath);
  });

  return [
    "# Navigation",
    "",
    "Read this file first, then talk to the coding agent naturally. Use locate or the active issue when you need a compact file map before searching broadly.",
    "",
    "## Read First",
    ...readFirstLinks.map((link) => `- ${link}`),
    `- Active issue: ${activeIssueLabel}`,
    "",
    "## Rules",
    ...relevantRuleLinks.map((link) => `- ${link}`),
    "",
    "## File Location",
    '- Use `flowness locate "<task description>"` when the agent needs read order, tests, commands, and relevant evidence paths.',
    `- Do not read closed issues, all logs, all workflows, all rules, or generated archives unless locate points there.`,
    "",
    "## Commands",
    "- Treat these as agent-facing or manual escape hatches.",
    '- `flowness locate "<task description>"`',
    "- `flowness test --summary`",
    "- `flowness audit --changed`",
    "",
  ].join("\n");
}

function renderActiveIssueMarkdown(
  analysis: ProjectAnalysis,
  activeIssue: ActiveIssueNavigationContext | null,
): string {
  const relevantRules = deriveRelevantRuleFiles(analysis);

  if (activeIssue === null) {
    return [
      "# Active Issue",
      "",
      "No active issue exists yet.",
      "",
      "## Where To Start",
      `- Read ${renderMarkdownLink("navigation.md", "../navigation.md")} first.`,
      '- Talk to the coding agent naturally, then run `flowness locate "<task description>"` when you need file location guidance.',
      "",
      "## Rules",
      ...relevantRules.slice(0, 6).map((rulePath) => {
        const relativeRulePath = stripFlownessPrefix(rulePath);
        return `- ${renderMarkdownLink(relativeRulePath, `../${relativeRulePath}`)}`;
      }),
      "",
    ].join("\n");
  }

  const evidenceFiles = activeIssue.evidenceFiles.length === 0
    ? ["- None yet."]
    : activeIssue.evidenceFiles.map((file) => `- ${renderMarkdownLink(file, file)}`);

  return [
    "# Active Issue",
    "",
    `- Issue: ${renderMarkdownLink(activeIssue.issueId, `../issues/${activeIssue.issueId}/issue.md`)}`,
    `- Title: ${activeIssue.issueTitle}`,
    `- State: ${activeIssue.issueState}`,
    `- Workflow: ${activeIssue.workflowId}`,
    ...(activeIssue.blocked
      ? [
          `- Block reason: ${activeIssue.blockReason ?? "blocked"}`,
          `- Pending step: ${renderMarkdownLink(activeIssue.pendingStep ?? activeIssue.currentStep, `../workflows/${activeIssue.workflowId}/${activeIssue.currentStepFile}`)}`,
          `- Required action: ${activeIssue.requiredAction ?? "Resolve the block before continuing."}`,
        ]
      : [
          `- Current step: ${renderMarkdownLink(activeIssue.currentStep, `../workflows/${activeIssue.workflowId}/${activeIssue.currentStepFile}`)}`,
          activeIssue.nextStep === null
            ? "- Next step: complete"
            : `- Next step: ${renderMarkdownLink(activeIssue.nextStep, `../workflows/${activeIssue.workflowId}/${activeIssue.nextStepFile}`)}`,
        ]),
    `- Issue file: ${renderMarkdownLink("issue.md", `../issues/${activeIssue.issueId}/issue.md`)}`,
    `- Workflow state: ${renderMarkdownLink("workflow-state.json", `../issues/${activeIssue.issueId}/workflow-state.json`)}`,
    `- Issue log: ${renderMarkdownLink("issue log", `../logs/${activeIssue.issueId}.md`)}`,
    '- File location: `flowness locate "<task description>"`',
    "",
    "## Evidence Files",
    ...evidenceFiles,
    "",
    "## Relevant Rules",
    ...activeIssue.relevantRules.slice(0, 8).map((rulePath) => {
      const relativeRulePath = stripFlownessPrefix(rulePath);
      return `- ${renderMarkdownLink(relativeRulePath, `../${relativeRulePath}`)}`;
    }),
    "",
    "## Commands",
    `- ${renderMarkdownLink("flowness test --summary", "../commands.json")}`,
    `- ${renderMarkdownLink("flowness audit --changed", "../commands.json")}`,
    "",
  ].join("\n");
}

async function collectRootFiles(rootDir: string): Promise<readonly string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries.map((entry) => entry.name).sort();
}

async function readPackageJson(rootDir: string): Promise<PackageJsonShape | null> {
  const packageJsonPath = join(rootDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    return null;
  }

  try {
    return await readJsonFile<PackageJsonShape>(packageJsonPath);
  } catch {
    return null;
  }
}

async function collectSourceDirectories(rootDir: string, rootFiles: readonly string[]): Promise<readonly string[]> {
  const discovered = new Set<string>();
  for (const candidate of ["src", "app", "apps", "lib"]) {
    if (rootFiles.includes(candidate) && await pathExists(join(rootDir, candidate))) {
      discovered.add(candidate);
    }
  }

  if (rootFiles.includes("packages") && await pathExists(join(rootDir, "packages"))) {
    const packageEntries = await readdir(join(rootDir, "packages"), { withFileTypes: true });
    for (const entry of packageEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageSrc = join(rootDir, "packages", entry.name, "src");
      if (await pathExists(packageSrc)) {
        discovered.add(`packages/${entry.name}/src`);
      }
    }
  }

  return [...discovered].sort();
}

async function collectDocumentationPaths(rootDir: string, rootFiles: readonly string[]): Promise<readonly string[]> {
  const discovered = new Set<string>();
  for (const file of rootFiles) {
    if (/^readme(\.[a-z0-9]+)?$/i.test(file)) {
      discovered.add(file);
    }
  }

  if (rootFiles.includes("docs") && await pathExists(join(rootDir, "docs"))) {
    const visitDocs = async (directory: string, relativeDir = ""): Promise<void> => {
      const docsEntries = await readdir(directory, { withFileTypes: true });
      for (const entry of docsEntries) {
        const relativePath = relativeDir.length === 0 ? entry.name : `${relativeDir}/${entry.name}`;
        const absolutePath = join(directory, entry.name);

        if (entry.isDirectory()) {
          await visitDocs(absolutePath, relativePath);
          continue;
        }

        if (entry.isFile() && entry.name.endsWith(".md")) {
          discovered.add(`docs/${relativePath}`);
        }
      }
    };

    await visitDocs(join(rootDir, "docs"));
  }

  return [...discovered].sort();
}

async function collectGitStatus(rootDir: string): Promise<string> {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.error instanceof Error) {
    return "Git status unavailable.";
  }

  if (result.status === 128 && /not a git repository/i.test(result.stderr ?? "")) {
    return "Not a git repository.";
  }

  const output = result.stdout?.trim() ?? "";
  return output.length === 0 ? "Clean working tree." : output;
}

function renderWorkflowStepMarkdown(
  workflow: WorkflowSpec,
  step: WorkflowStepSpec,
  previousStep: WorkflowStepSpec | null,
  nextStep: WorkflowStepSpec | null,
  analysis: ProjectAnalysis,
): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";
  const nextStepTitle = nextStep === null ? "none" : nextStep.title;
  const currentFileLink = `[${step.fileName}](./${step.fileName})`;
  const previousStepLink = previousStep === null ? "none" : `[${previousStep.fileName}](./${previousStep.fileName})`;
  const nextStepLink = nextStep === null ? "none" : `[${nextStep.fileName}](./${nextStep.fileName})`;
  const requiredCommandUsage = [
    '- The coding agent may use `flowness run "<request>"` to create or route a request through the workflow.',
    "- The coding agent may use `flowness step --issue ISSUE-ID` to advance exactly one workflow step.",
    "- The coding agent may use `flowness status --issue ISSUE-ID` to check the current state before and after transitions.",
    "- The coding agent may use `flowness evidence:add --issue ISSUE-ID ...` to record evidence without editing JSON by hand.",
  ];

  const requiredInputs = [
    "The current workflow step file.",
    "The current request or issue summary.",
    "The latest issue log entry and workflow state for this issue.",
    "The project profile and context index under `.flowness/`.",
    analysis.sourceDirectories.length > 0
      ? `Relevant source directories: ${analysis.sourceDirectories.join(", ")}.`
      : "TODO: detect the source directories before starting the step.",
  ];

  const actions = [
    `Keep the ${workflow.title.toLowerCase()} flow focused on ${workflow.focus}.`,
    "Read the current step and follow the `Next` link before moving on.",
    "Append evidence to the issue log before writing the next workflow state.",
    "Stop and recover first if the latest log entry and workflow state disagree.",
    `Use \`${buildCommand}\`, \`${testCommand}\`, and \`${lintCommand}\` when they are relevant to the step.`,
    "Do not skip workflow steps or advance state without the matching log entry.",
  ];

  const evidenceRequired = [
    "The step note itself and the related issue log entry.",
    analysis.testCommand === null
      ? "TODO: add a project test command to make evidence stronger."
      : `Output from \`${analysis.testCommand}\` when this step changes code.`,
    analysis.buildCommand === null
      ? "TODO: add a project build command if the project ships code."
      : `Output from \`${analysis.buildCommand}\` when the step reaches a delivery point.`,
  ];

  const exitCriteria = [
    `The ${step.title.toLowerCase()} outcome is documented.`,
    `The next step is \`${nextStepTitle}\`.`,
  ];

  const gateBehavior: string[] = [
    `Human gate mode: ${step.humanGate}.`,
  ];

  if (step.humanGate === "always") {
    gateBehavior.push("Explicit approval must be appended to the issue log before the next step runs.");
    exitCriteria.push("Explicit approval is logged before the next step starts.");
  } else if (step.humanGate === "optional") {
    gateBehavior.push("Approval is optional, but the log must still capture the reason the step continued.");
  } else {
    gateBehavior.push("No human approval gate is required for this step, but the log still needs to stay aligned.");
  }

  if (step.title === "Clarifying Questions") {
    requiredInputs.push(
      "The current list of missing questions.",
      "Any assumptions already captured in the analysis step.",
    );
    actions.push("Write the missing questions that block the plan and note any assumptions explicitly.");
    actions.push("Ask questions with multiple options, pros and cons, a recommended default, and a clear request for the user's choice.");
    evidenceRequired.push("The rich clarification question list and the captured assumptions.");
    exitCriteria.push("The missing requirements are captured in the issue log.");
  }

  if (step.title === "Scope Definition") {
    requiredInputs.push(
      "The users, goals, constraints, risks, scope boundary, non-goals, and acceptance criteria.",
    );
    actions.push("Draw the line around the scope and call out what is deliberately out of scope.");
    actions.push("Do not advance to Implementation until the approval is logged.");
    evidenceRequired.push("The scoped boundary, the non-goals, and the approval log entry.");
    exitCriteria.push("The scope is approved in the log and the next step link is safe to follow.");
  }

  if (step.title === "Implementation") {
    requiredInputs.push(
      "The approved scope and the latest Evidence Review status.",
    );
    actions.push("Record the implementation work, but do not close until Evidence Review is logged.");
    evidenceRequired.push("The implementation diff and the evidence-review gate record.");
    exitCriteria.push("Evidence Review is logged before close is allowed.");
  }

  if (step.title === "Evidence Review") {
    requiredInputs.push(
      "The files changed.",
      "The tests, build, and lint commands that were run.",
      "The command outputs or concise summaries.",
      "Any docs updated because the behavior changed.",
      "Any unresolved risks or follow-up items.",
    );
    actions.push("Check the changed files, the commands that ran, the documentation updates, and any remaining risks.");
    actions.push("Verify that the implementation can close only after this review is recorded.");
    evidenceRequired.push(
      "A changed-files summary.",
      "Command outputs or summaries for tests, build, and lint.",
      "Documentation update notes when docs changed.",
      "A note about unresolved risks.",
    );
    exitCriteria.push("The implementation can close only after this review is recorded.");
  }

  if (step.title === "Commit") {
    requiredInputs.push(
      "The commit rules under `.flowness/rules/git.md`.",
      "The active issue record and workflow state.",
      "The Evidence Review report and log entry.",
      "The current git status and diff summary for the changed files.",
    );
    actions.push("Read the git rules before staging or committing anything.");
    actions.push("Inspect the active issue, workflow state, Evidence Review report, git status, and diff summary before choosing the commit message.");
    actions.push("Resolve the repository from the changed files, not from the process cwd.");
    actions.push("Stage only the approved files, exclude unsafe outputs, and stop if there are no intended changes.");
    actions.push("Ask for approval when the project rules require it.");
    actions.push("Report the repo root, commit hash, commit message, and changed files after the commit succeeds.");
    evidenceRequired.push(
      "The git rules note.",
      "The active issue record and workflow state.",
      "The Evidence Review report and its command evidence.",
      "The git status output.",
      "The cached diff stat.",
      "The final repo root, commit hash, commit message, and changed file list.",
    );
    exitCriteria.push("The commit hash and changed file list are recorded.");
  }

  if (step.title === "Close") {
    requiredInputs.push(
      "The Evidence Review log entry.",
      "The final review result.",
      "Any unresolved risks that must be carried forward.",
      "The commit hash if this workflow requires a final commit.",
    );
    actions.push("Verify the latest log entry before closing.");
    actions.push("Do not close if Evidence Review is missing.");
    evidenceRequired.push("The Evidence Review log entry and the final review summary.");
    exitCriteria.push("The issue can close without any missing review gate.");
  }

  if (workflow.id === "code-review") {
    if (step.title === "Intake" || step.title === "Clarifying Questions" || step.title === "Scope Definition" || step.title === "Diff Review") {
      requiredInputs.push(
        ".flowness/navigation.md",
        ".flowness/context-index.json",
      );
      actions.push("Use `flowness locate` and the context index to narrow the review target before broad reading.");
      actions.push("Prefer changed files and diff summaries over full repository reads.");
      evidenceRequired.push("The locate output or context index entry that narrowed the review surface.");
      exitCriteria.push("The review surface is narrowed to the smallest relevant files.");
    }

    if (step.title === "Findings Synthesis" || step.title === "Evidence Review") {
      actions.push("Run the Architecture, Correctness, Security, Test Coverage, and Maintainability perspectives before closing.");
      evidenceRequired.push("The per-perspective findings and the consolidated recommendation.");
      exitCriteria.push("The findings are ordered by severity and ready for recommendation.");
    }
  }

  if (workflow.id === "mvp-planning") {
    if (step.title === "Intake" || step.title === "Requirement Analysis" || step.title === "Clarifying Questions") {
      requiredInputs.push(
        "docs/PRD.md",
        "docs/ARD.md",
      );
      actions.push("Check whether PRD/ARD exist and create minimal versions before the plan moves forward.");
      evidenceRequired.push("docs/PRD.md", "docs/ARD.md");
      exitCriteria.push("PRD and ARD exist before the planning workflow reaches the later steps.");
    }

    if (step.title === "Requirement Analysis") {
      requiredInputs.push(
        "The users and stakeholders behind the request.",
        "The problem being solved and the desired outcome.",
        "Known risks, constraints, and deadlines.",
      );
      actions.push("Capture assumptions, missing information, and anything that must be clarified before the plan is written.");
    }

    if (step.title === "MVP Plan") {
      requiredInputs.push(
        "A scoped MVP, the risk notes, and the list of open questions.",
      );
      actions.push("Write the reviewed plan in a form that can be checked before any development issues are generated.");
      evidenceRequired.push("The reviewed plan text and the recorded review outcome.");
      exitCriteria.push("The plan can be handed off for review without further ambiguity.");
    }

    if (step.title === "Plan Review") {
      requiredInputs.push(
        "The written MVP plan and any open questions.",
      );
      actions.push("Review the plan against the goals, constraints, and non-goals before child issues are generated.");
      evidenceRequired.push("The review result and any blocking follow-up items.");
      exitCriteria.push("The plan is approved or the blocking changes are recorded.");
    }

    if (step.title === "Issue Breakdown") {
      requiredInputs.push(
        "The reviewed MVP plan.",
        "The accepted scope and the list of out-of-scope items.",
      );
      actions.push("Split the reviewed plan into child issues with titles, types, workflows, goals, acceptance criteria, dependencies, and evidence requirements.");
      evidenceRequired.push("The issue breakdown list and parent/child relation notes.");
      exitCriteria.push("Every development issue is grounded in the reviewed plan.");
    }
  }

  if (workflow.id === "feature-development") {
    if (step.title === "Intake" || step.title === "Clarifying Questions" || step.title === "Requirement Analysis") {
      requiredInputs.push(
        "docs/PRD.md",
        "docs/ARD.md",
      );
      actions.push("Check whether PRD/ARD or equivalent docs exist and create minimal versions if they are missing.");
      evidenceRequired.push("docs/PRD.md", "docs/ARD.md");
      exitCriteria.push("PRD/ARD exist before implementation starts.");
    }
  }

  const requiredInputFiles = [
    renderMarkdownLink("navigation.md", "../../navigation.md"),
    renderMarkdownLink("project-profile.md", "../../project-profile.md"),
    renderMarkdownLink("context-index.json", "../../context-index.json"),
    renderMarkdownLink("harness-manifest.json", "../../harness-manifest.json"),
    renderMarkdownLink("active-issue.md", "../../state/active-issue.md"),
    renderMarkdownLink("issue.md", "../../issues/ISSUE-ID/issue.md"),
    renderMarkdownLink("workflow-state.json", "../../issues/ISSUE-ID/workflow-state.json"),
    renderMarkdownLink("issue log", "../../logs/ISSUE-ID.md"),
    renderMarkdownLink("PRD.md", "../../../docs/PRD.md"),
    renderMarkdownLink("ARD.md", "../../../docs/ARD.md"),
  ];

  const requiredOutputFiles = [
    renderMarkdownLink("issue.md", "../../issues/ISSUE-ID/issue.md"),
    renderMarkdownLink("workflow-state.json", "../../issues/ISSUE-ID/workflow-state.json"),
    renderMarkdownLink("issue log", "../../logs/ISSUE-ID.md"),
    renderMarkdownLink("PRD.md", "../../../docs/PRD.md"),
    renderMarkdownLink("ARD.md", "../../../docs/ARD.md"),
  ];

  const relevantRuleLinks = deriveRelevantRuleFiles(analysis).map((rulePath) => {
    const relativeRulePath = stripFlownessPrefix(rulePath);
    return renderMarkdownLink(relativeRulePath, `../../${relativeRulePath}`);
  });

  return [
    "---",
    `workflow: ${workflow.id}`,
    `name: ${step.title}`,
    `human_gate: ${step.humanGate}`,
    `next: ${nextStepTitle}`,
    "---",
    "",
    `# ${step.title}`,
    "",
    "## Step Metadata",
    `- Current Step: ${step.title}`,
    `- Step File: ${currentFileLink}`,
    "",
    "## Step Navigation",
    `- Previous: ${previousStepLink}`,
    `- Next: ${nextStepLink}`,
    "",
    "## Purpose",
    step.purpose,
    "",
    "## Human Gate",
    `- ${step.humanGate}`,
    "",
    "## Gate Behavior",
    ...gateBehavior.map((item) => `- ${item}`),
    "",
    "## Required Command / Runner Usage",
    ...requiredCommandUsage.map((item) => `- ${item}`),
    "",
    "## Project Context",
    `- Project: ${analysis.projectName}`,
    `- Package manager: ${analysis.packageManager}`,
    `- Language: ${analysis.language}`,
    `- Framework: ${analysis.framework}`,
    "",
    "## Required Input Files",
    ...requiredInputFiles.map((item) => `- ${item}`),
    "",
    "## Required Output Files",
    ...requiredOutputFiles.map((item) => `- ${item}`),
    "",
    "## Relevant Rules",
    ...relevantRuleLinks.map((link) => `- ${link}`),
    "",
    "## Required Inputs",
    ...requiredInputs.map((item) => `- ${item}`),
    "",
    "## Actions",
    ...actions.map((item) => `- ${item}`),
    "",
    "## Evidence Required",
    ...evidenceRequired.map((item) => `- ${item}`),
    "",
    "## Exit Criteria",
    ...exitCriteria.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderWorkflowReadme(workflow: WorkflowSpec, analysis: ProjectAnalysis): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";

  return [
    `# ${workflow.title}`,
    "",
    workflow.summary,
    "",
    "## Step Files",
    ...workflow.steps.map((step) => `- ${step.fileName}: ${step.title}`),
    "",
    "## Commands",
    `- Build: ${buildCommand}`,
    `- Test: ${testCommand}`,
    `- Lint: ${lintCommand}`,
    "",
    "## Notes",
    `- Focus: ${workflow.focus}.`,
    "- These step files guide the coding agent after `flowness init`; the primary human interface is natural conversation.",
    "- Each step file is ordered and should be read from top to bottom.",
    "- Each step file includes frontmatter that the workflow loader can parse.",
    "- Each step file includes current-step metadata, navigation links, gate behavior, runner usage, and evidence requirements.",
    "- The final workflow step is Commit, and Close comes only after the commit record exists.",
    "",
  ].join("\n");
}

function renderSkillMarkdown(title: string, analysis: ProjectAnalysis, bullets: readonly string[]): string {
  return [
    `# ${title}`,
    "",
    "## Purpose",
    bullets[0] ?? "Support the current project workflow.",
    "",
    "## When to Use",
    ...bullets.slice(1, 3).map((line) => `- ${line}`),
    "",
    "## Inputs",
    "- Project profile",
    analysis.sourceDirectories.length === 0
      ? "- TODO: detect source directories."
      : `- Source directories: ${analysis.sourceDirectories.join(", ")}`,
    analysis.testCommand === null
      ? "- TODO: detect a test command."
      : `- Test command: \`${analysis.testCommand}\``,
    analysis.buildCommand === null
      ? "- TODO: detect a build command."
      : `- Build command: \`${analysis.buildCommand}\``,
    "",
    "## Actions",
    ...bullets.slice(3, 6).map((line) => `- ${line}`),
    "",
    "## Evidence Required",
    "- Relevant files or diffs.",
    analysis.testCommand === null ? "- TODO: add a project test command." : `- Output from \`${analysis.testCommand}\`.`,
    "",
    "## Exit Criteria",
    bullets[6] ?? "A next action is clear and the issue log can be updated.",
    "",
  ].join("\n");
}

export function renderProjectAnalysis(rootDir: string, projectName?: string): Promise<ProjectAnalysis> {
  return (async () => {
    const rootFiles = await collectRootFiles(rootDir);
    const packageJson = await readPackageJson(rootDir);
    const packageManager = detectPackageManager(rootFiles);
    const language = detectLanguage(packageJson, rootFiles);
    const framework = detectFramework(packageJson, rootFiles);
    const sourceDirectories = await collectSourceDirectories(rootDir, rootFiles);
    const documentationPaths = await collectDocumentationPaths(rootDir, rootFiles);
    const gitStatus = await collectGitStatus(rootDir);
    const scripts = packageJson?.scripts ?? {};
    const buildCommand = scripts.build !== undefined ? normalizeScriptCommand(packageManager, "build") : null;
    const testCommand = scripts.test !== undefined ? normalizeScriptCommand(packageManager, "test") : null;
    const lintCommand = scripts.lint !== undefined ? normalizeScriptCommand(packageManager, "lint") : null;

    const notes: string[] = [];
    if (packageJson === null) {
      notes.push("No package.json file was detected.");
    } else {
      notes.push(`package.json name: ${packageJson.name ?? "TODO: detect a project name"}.`);
    }
    if (buildCommand === null) {
      notes.push("Build command was not detected.");
    }
    if (testCommand === null) {
      notes.push("Test command was not detected.");
    }
    if (lintCommand === null) {
      notes.push("Lint command was not detected.");
    }
    if (sourceDirectories.length === 0) {
      notes.push("No source directories were detected.");
    }
    if (documentationPaths.length === 0) {
      notes.push("No README or docs files were detected.");
    }

    const fallbackName = rootDir.split(/[/\\]/).filter(Boolean).at(-1) ?? "flowness";
    const resolvedProjectName = projectName ?? packageJson?.name ?? fallbackName;

    return {
      rootDir,
      projectName: resolvedProjectName,
      packageManager,
      language,
      framework,
      buildCommand,
      testCommand,
      lintCommand,
      sourceDirectories,
      documentationPaths,
      gitStatus,
      packageJsonPath: packageJson === null ? null : join(rootDir, "package.json"),
      notes,
    };
  })();
}

export function renderGeneratedAgentsMarkdown(analysis: ProjectAnalysis): string {
  return [
    "<!-- FLOWNESS:BEGIN -->",
    "# AGENTS",
    "",
    "Keep this file short. After `flowness init`, talk to the coding agent in natural language first, then use the generated files when you need setup, debugging, recovery, inspection, or manual escape hatches.",
    "",
    "## Start Here",
    "- Read `.flowness/navigation.md` first.",
    "- Use `.flowness/context-index.json` to locate files.",
    "- Use `.flowness/commands.json` for commands.",
    "- Use the command list as agent-facing instructions and manual escape hatches, not as the normal human workflow.",
    "- Ask for the work in natural language first; only switch to commands when you need explicit control.",
    '- Use `flowness locate "<task description>"` when you need the smallest useful file map.',
    "- Key escape hatches: `flowness review:run --issue ISSUE-ID`, `flowness test --summary`, and `flowness audit --changed`.",
    "- Treat `.flowness/` as the source of truth and `.agent/` as legacy only.",
    "- Keep issue logs append-only and keep evidence summaries short and reviewable.",
    "- Never edit workflow state by hand.",
    "",
    "## Current Project",
    `- Project: ${analysis.projectName} | Package manager: ${analysis.packageManager} | Language: ${analysis.language} | Framework: ${analysis.framework}`,
    "",
    "## Rules",
    "- `.flowness/rules/git.md`, `.flowness/rules/commit-policy.md`, `.flowness/rules/evidence-policy.md`, `.flowness/rules/performance-improvement.md`, `.flowness/rules/rule-update-log.md`, `.flowness/rules/workflow-routing.md`, and other `.flowness/rules/*.md` files.",
    "",
    "## Notes",
    "- See `.flowness/project-profile.md` for any detected caveats.",
    "- Do not paste long transcripts into logs, findings, or reviews.",
    "",
    "<!-- FLOWNESS:END -->",
    "",
  ].join("\n");
}

export function renderGeneratedProjectProfileMarkdown(analysis: ProjectAnalysis): string {
  return [
    "# Project Profile",
    "",
    `- Project: ${analysis.projectName}`,
    `- Package manager: ${analysis.packageManager}`,
    `- Language: ${analysis.language}`,
    `- Framework: ${analysis.framework}`,
    "",
    "## Commands",
    renderCommandLine("Build", analysis.buildCommand),
    renderCommandLine("Test", analysis.testCommand),
    renderCommandLine("Lint", analysis.lintCommand),
    "",
    "## Source Directories",
    renderList("Detected source directories", analysis.sourceDirectories),
    "",
    "## Documentation",
    renderList("Detected README/docs files", analysis.documentationPaths),
    "",
    "## Git Status",
    analysis.gitStatus,
    "",
    "## Notes",
    renderProjectNotes(analysis.notes),
    "",
  ].join("\n");
}

export function renderGeneratedProjectCommandsMarkdown(analysis: ProjectAnalysis): string {
  return JSON.stringify({
    workflow: [
      "Install the CLI.",
      "Run flowness init once per project.",
      "Talk to the coding agent naturally for the normal development flow.",
      "Use the command list below as setup, debugging, recovery, or manual escape hatches.",
    ],
    commands: {
      init: "flowness init",
      run: 'flowness run "<request>"',
      reviewRun: "flowness review:run --issue ISSUE-ID",
      step: "flowness step --issue ISSUE-ID",
      status: "flowness status --issue ISSUE-ID",
      locate: 'flowness locate "<task description>"',
      testSummary: "flowness test --summary",
      auditChanged: "flowness audit --changed",
      auditFull: "flowness audit --full",
      evidenceAdd: "flowness evidence:add --issue ISSUE-ID --kind file --title \"...\" --location path",
      ruleUpdate: "flowness rule:update --id RULE-ID --input \"...\"",
      validate: "flowness validate",
      workflowValidate: "flowness workflow:validate [workflow-id]",
    },
    project: {
      build: analysis.buildCommand,
      test: analysis.testCommand,
      lint: analysis.lintCommand,
      packageManager: analysis.packageManager,
    },
  }, null, 2) + "\n";
}

function renderGeneratedFindingsReadmeMarkdown(analysis: ProjectAnalysis): string {
  return [
    "# Findings",
    "",
    "Use this directory for real review findings only.",
    "",
    "## Format",
    "- Keep each finding compact.",
    "- Use ID, Perspective, Severity, Status, Blocker kind, File/path, Evidence, Problem, Recommendation, and Requires follow-up issue.",
    "- Separate hard blockers from deferrable blockers.",
    "- Order the most severe findings first.",
    "- Link to the smallest file, command output, or raw artifact that proves the issue.",
    "- Do not paste long transcripts here.",
    "",
    "## Commands",
    "- `flowness review:run --issue ISSUE-ID`",
    "- `flowness test --summary`",
    "",
    "## Notes",
    "- Findings should be concise enough to scan quickly.",
    "- Use finding statuses to show whether a blocker is open, addressed, closed, deferred, or accepted-risk.",
    "- Use the template under `.flowness/templates/finding-template.md` when drafting a new finding.",
    renderProjectNotes(analysis.notes),
    "",
  ].join("\n");
}

async function renderGeneratedContextIndexJson(
  analysis: ProjectAnalysis,
  rootDir: string,
): Promise<string> {
  const contextIndex = await buildContextIndex(rootDir, analysis);
  return JSON.stringify({
    projectName: analysis.projectName,
    rootDir: ".",
    areas: contextIndex.areas,
  }, null, 2) + "\n";
}

function renderGeneratedHarnessManifestJson(
  analysis: ProjectAnalysis,
  activeIssue: ActiveIssueNavigationContext | null = null,
  generatedFileHashes: GeneratedFileHashes = {},
): string {
  const payload = {
    version: "0.2.5",
    project: {
      name: analysis.projectName,
      packageManager: analysis.packageManager,
      language: analysis.language,
      framework: analysis.framework,
    },
    contextFiles: {
      projectProfile: ".flowness/project-profile.md",
      contextIndex: ".flowness/context-index.json",
      navigation: ".flowness/navigation.md",
      commands: ".flowness/commands.json",
      harnessManifest: ".flowness/harness-manifest.json",
      activeIssue: ".flowness/state/active-issue.md",
      findings: ".flowness/findings/README.md",
      prd: "docs/PRD.md",
      ard: "docs/ARD.md",
    },
    workspace: {
      config: ".flowness/config/project.yaml",
      findings: ".flowness/findings",
      docs: "docs",
      issues: ".flowness/issues",
      logs: ".flowness/logs",
      workflows: ".flowness/workflows",
      rules: ".flowness/rules",
      rulesTech: ".flowness/rules/tech",
      skills: ".flowness/skills",
      scripts: ".flowness/scripts",
      templates: ".flowness/templates",
      prompts: ".flowness/prompts",
      settings: ".flowness/settings",
      state: ".flowness/state",
    },
    commands: {
      run: "flowness run \"<request>\"",
      reviewRun: "flowness review:run --issue ISSUE-ID",
      step: "flowness step --issue ISSUE-ID",
      status: "flowness status --issue ISSUE-ID",
      locate: "flowness locate \"<task description>\"",
      testSummary: "flowness test --summary",
      auditChanged: "flowness audit --changed",
      auditFull: "flowness audit --full",
      evidenceAdd: "flowness evidence:add --issue ISSUE-ID --kind file --title \"...\" --location path",
      ruleUpdate: "flowness rule:update --id RULE-ID --input \"...\"",
      validate: "flowness validate",
    },
    relevantRules: deriveRelevantRuleFiles(analysis),
    activeIssue: activeIssue === null ? null : {
      issueId: activeIssue.issueId,
      issueState: activeIssue.issueState,
      workflowId: activeIssue.workflowId,
      currentStep: activeIssue.currentStep,
      nextStep: activeIssue.nextStep,
      blocked: activeIssue.blocked,
      blockReason: activeIssue.blockReason,
      pendingStep: activeIssue.pendingStep,
      requiredAction: activeIssue.requiredAction,
      issueFile: activeIssue.issueFile,
      workflowStateFile: activeIssue.workflowStateFile,
      issueLogFile: activeIssue.issueLogFile,
      currentStepFile: activeIssue.currentStepFile,
      nextStepFile: activeIssue.nextStepFile,
      evidenceFiles: [...activeIssue.evidenceFiles],
      relevantRules: [...activeIssue.relevantRules],
    },
    sourceDirectories: analysis.sourceDirectories,
    documentationPaths: analysis.documentationPaths,
    gitStatus: analysis.gitStatus,
    notes: analysis.notes,
    generatedFileHashes,
  };

  const manifestHash = sha256Hex(`${JSON.stringify(payload, null, 2)}\n`);
  return `${JSON.stringify({
    ...payload,
    manifestHash,
  }, null, 2)}\n`;
}

export function renderGeneratedConfigArtifacts(
  analysis: ProjectAnalysis,
  activeIssue: ActiveIssueNavigationContext | null = null,
  rootDir?: string,
): Promise<readonly ScaffoldArtifact[]> {
  const resolvedRootDir = rootDir ?? ".";
  return (async () => [
    artifact(".flowness/project-profile.md", renderGeneratedProjectProfileMarkdown(analysis)),
    artifact(".flowness/context-index.json", await renderGeneratedContextIndexJson(analysis, resolvedRootDir)),
    artifact(".flowness/commands.json", renderGeneratedProjectCommandsMarkdown(analysis)),
    artifact(".flowness/findings/README.md", renderGeneratedFindingsReadmeMarkdown(analysis)),
  ])();
}

export function renderGeneratedHarnessManifestArtifact(
  analysis: ProjectAnalysis,
  activeIssue: ActiveIssueNavigationContext | null = null,
  generatedFileHashes: GeneratedFileHashes = {},
): ScaffoldArtifact {
  return artifact(".flowness/harness-manifest.json", renderGeneratedHarnessManifestJson(analysis, activeIssue, generatedFileHashes));
}

export function renderGeneratedNavigationArtifacts(
  analysis: ProjectAnalysis,
  activeIssue: ActiveIssueNavigationContext | null = null,
): readonly ScaffoldArtifact[] {
  return [
    artifact(".flowness/navigation.md", renderNavigationMarkdown(analysis, activeIssue)),
    artifact(".flowness/state/active-issue.md", renderActiveIssueMarkdown(analysis, activeIssue)),
  ];
}

export function renderGeneratedPlanningDocArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact("docs/PRD.md", renderPlanningDocMarkdown({
      title: "PRD",
      intro: "Product requirements document for the current project.",
      summary: "Capture the topic, target users, main problem, core features, non-goals, acceptance criteria, and open questions before implementation starts.",
      sections: [
        {
          title: "## Product Topic / Users / Problem",
          bullets: [
            "Product topic: TODO",
            "Target users: TODO",
            "Main problem: TODO",
          ],
        },
        {
          title: "## Core Features / Non-goals",
          bullets: [
            "Core features: TODO",
            "Non-goals: TODO",
            "Acceptance criteria: TODO",
          ],
        },
        {
          title: "## Open Questions",
          bullets: [
            "What tradeoffs still need user confirmation?",
            "What should stay out of the first delivery?",
          ],
        },
      ],
      links: [
        renderMarkdownLink("Navigation", "../.flowness/navigation.md"),
        renderMarkdownLink("ARD", "ARD.md"),
      ],
    })),
    artifact("docs/ARD.md", renderPlanningDocMarkdown({
      title: "ARD",
      intro: "Architecture requirements document for the current project.",
      summary: "Record the language, framework, package manager, runtime/version, storage, auth, scale, deployment, and testing expectations before implementation starts.",
      sections: [
        {
          title: "## Stack",
          bullets: [
            `Language: ${analysis.language}`,
            `Framework: ${analysis.framework}`,
            `Package manager: ${analysis.packageManager}`,
            analysis.buildCommand === null ? "Runtime/version: TODO" : `Build command: ${analysis.buildCommand}`,
          ],
        },
        {
          title: "## Storage / Auth / Deployment / Scale",
          bullets: [
            "Database / storage: TODO",
            "Auth requirement: TODO",
            "Expected scale: TODO",
            "Deployment target: TODO",
          ],
        },
        {
          title: "## Test Strategy / Security",
          bullets: [
            analysis.testCommand === null ? "Test strategy: TODO" : `Test strategy: use ${analysis.testCommand}`,
            analysis.lintCommand === null ? "Lint strategy: TODO" : `Lint strategy: use ${analysis.lintCommand}`,
            "Security concerns: TODO",
          ],
        },
      ],
      links: [
        renderMarkdownLink("Navigation", "../.flowness/navigation.md"),
        renderMarkdownLink("PRD", "PRD.md"),
      ],
    })),
    artifact("docs/troubleshooting/performance-improvements.md", renderPlanningDocMarkdown({
      title: "Performance Improvements Troubleshooting",
      intro: "Use this guide when a request is slow, a benchmark is noisy, or the before/after comparison is hard to trust.",
      summary: "Keep the performance workflow repeatable: capture a baseline, rerun the same workload after the change, compare the result, write a compact summary, and document any measurement limits.",
      sections: [
        {
          title: "## Baseline",
          bullets: [
            "Record the starting metric, workload, and environment.",
            "Capture the exact command or benchmark that produced the baseline.",
          ],
        },
        {
          title: "## Compact Summary",
          bullets: [
            "Record the scenario, baseline, after/result, workload or iterations, key metric, raw report path, limitations, and follow-up issue if any.",
            "Keep the summary short enough that a reviewer can judge the result without opening the raw artifact first.",
          ],
        },
        {
          title: "## Measurement",
          bullets: [
            "Run the same workload after the change.",
            "Use the same metric whenever possible.",
            "Note any differences in machine, cache state, sample size, or input data.",
          ],
        },
        {
          title: "## Troubleshooting",
          bullets: [
            "If the result is noisy, rerun the measurement and record the noise source.",
            "If the metric is unclear, narrow the request to one user flow or endpoint.",
            "If the raw output is large, link it and keep the compact summary as the primary review surface.",
            "If the change is durable, update `performance-improvement.md` and record the approval in `rule-update-log.md`.",
          ],
        },
        {
          title: "## Evidence",
          bullets: [
            "Attach the baseline output, the follow-up output, the comparison summary, and the raw report path.",
            "Link to the relevant source files or commands that prove the change.",
          ],
        },
      ],
      links: [
        renderMarkdownLink("Navigation", "../.flowness/navigation.md"),
        renderMarkdownLink("Evidence Summary", "evidence-summary.md"),
        renderMarkdownLink("Performance Improvement Rule", "../.flowness/rules/performance-improvement.md"),
      ],
    })),
    artifact("docs/troubleshooting/evidence-summary.md", renderPlanningDocMarkdown({
      title: "Evidence Summary",
      intro: "Use this guide when a reviewer needs the smallest useful summary before opening a large raw artifact.",
      summary: "Capture the scenario, baseline, after/result, workload or iterations, key metric, raw report path, limitations, and follow-up issue if any. Keep the summary short enough that a reviewer can decide quickly.",
      sections: [
        {
          title: "## Required Fields",
          bullets: [
            "Scenario: TODO",
            "Before / baseline: TODO",
            "After / result: TODO",
            "Workload / iterations: TODO",
            "Key metric: TODO",
            "Raw report path: TODO",
            "Limitations: TODO",
            "Follow-up issue: TODO",
          ],
        },
        {
          title: "## Review Rules",
          bullets: [
            "Keep the summary compact and link the raw artifact instead of pasting a huge log.",
            "Large raw evidence alone must not fail review when the compact summary is present.",
            "Record the user-visible conclusion separately from the raw benchmark or profiling output.",
          ],
        },
        {
          title: "## When To Use",
          bullets: [
            "Use this alongside performance evidence, benchmark notes, and any review that would otherwise produce oversized raw output.",
            "Use it for any evidence bundle where the compact summary should be the primary review surface.",
          ],
        },
      ],
      links: [
        renderMarkdownLink("Navigation", "../.flowness/navigation.md"),
        renderMarkdownLink("Performance Improvements", "performance-improvements.md"),
      ],
    })),
  ];
}

export function renderGeneratedRuleArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  const currentState = "initial scaffold";
  const stackLabel = analysis.framework === "Unknown"
    ? analysis.language
    : `${analysis.language} / ${analysis.framework}`;

  const techRuleArtifacts = techRuleSpecs.map((spec) => artifact(
    `.flowness/rules/tech/${spec.fileName}`,
    renderTechRuleMarkdown(spec, analysis),
  ));

  return [
    artifact(".flowness/rules/README.md", [
      "# Rules",
      "",
      "Current-state rule files live here. Use `rule-update-log.md` for history and keep the individual rule files free of append-only change logs.",
      "",
      "## Core Rules",
      "- `request-analysis.md`",
      "- `clarification-policy.md`",
      "- `issue-decomposition.md`",
      "- `fail-closed-workflow.md`",
      "- `flowness-activation.md`",
      "- `workflow-routing.md`",
      "- `definition-of-done.md`",
      "- `evidence-policy.md`",
      "- `performance-improvement.md`",
      "- `git.md`",
      "- `commit-policy.md`",
      "- `workflow-step-contract.md`",
      "- `project-overrides.md`",
      "- `rule-update-log.md`",
      "",
      "## Tech Rules",
      "- `tech/README.md`",
      "- `tech/java.md`",
      "- `tech/javascript.md`",
      "- `tech/typescript.md`",
      "- `tech/python.md`",
      "- `tech/spring.md`",
      "- `tech/react.md`",
      "- `tech/nextjs.md`",
      "- `tech/nestjs.md`",
      "- `tech/django.md`",
      "",
      "Keep rule files concise, current-state only, and easy to update in place.",
      "",
    ].join("\n")),
    artifact(".flowness/rules/request-analysis.md", renderRuleDocumentMarkdown({
      title: "Request Analysis",
      ruleId: "request-analysis",
      scope: "Classify incoming requests before creating issues or changing durable rules.",
      policy: [
        "Classify first, then choose the workflow or approval path.",
        "Treat casual conversation and simple questions as non-issue work.",
        "Use `rule_change_candidate` when a request changes a durable convention or policy.",
        "Reuse an existing open issue when the request matches the same work item.",
        "Route feature, bugfix, refactor, review, planning, and performance work to the matching workflow.",
      ],
      examples: [
        "로그인 기능 만들어줘 -> feature issue.",
        "React는 feature-based로 작성해 -> rule approval prompt.",
      ],
      lastUpdated: currentState,
      notes: ["Keep the routing decision visible in the issue log."],
    })),
    artifact(".flowness/rules/clarification-policy.md", renderRuleDocumentMarkdown({
      title: "Clarification Policy",
      ruleId: "clarification-policy",
      scope: "Ask only for the missing information that blocks safe progress.",
      policy: [
        "Ask early when the request is underspecified.",
        "Keep questions focused on decision points, not on background chatter.",
        "Use multiple options with pros and cons plus a recommended default.",
        "Stop before implementation if a required answer is still missing.",
      ],
      examples: [
        "Need target users and acceptance criteria before MVP planning.",
        "Need baseline and metric before performance work.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/issue-decomposition.md", renderRuleDocumentMarkdown({
      title: "Issue Decomposition",
      ruleId: "issue-decomposition",
      scope: "Split broad requests into independently executable child issues.",
      policy: [
        "Create a parent issue for the plan and child issues for execution slices.",
        "Keep each child issue small enough to verify independently.",
        "Include goal, acceptance criteria, dependencies, and evidence requirements.",
      ],
      examples: [
        "Shopping mall -> catalog, cart, orders, admin slices.",
        "Community site -> access, posts, moderation, admin slices.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/fail-closed-workflow.md", renderRuleDocumentMarkdown({
      title: "Fail Closed Workflow",
      ruleId: "fail-closed-workflow",
      scope: "Protect workflow state transitions and human gates.",
      policy: [
        "Do not skip workflow steps.",
        "Do not advance state before the matching log entry exists.",
        "Do not pass a human gate without explicit approval evidence.",
        "Do not close without evidence review and recorded evidence.",
      ],
      examples: [
        "Evidence Review missing before Close -> stop.",
        "State/log mismatch -> recover before continuing.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/flowness-activation.md", renderRuleDocumentMarkdown({
      title: "Flowness Activation",
      ruleId: "flowness-activation",
      scope: "Define how a project should behave after `flowness init`.",
      policy: [
        "Initialize once, then work through the coding agent in natural language.",
        "Use Flowness for new work and keep `.agent/` as legacy only.",
        "Analyze the request before creating or reusing work items.",
        "Ask for clarification when the requirements are incomplete.",
      ],
      examples: [
        "Run `flowness init` once, then continue through the agent workflow.",
        "Reuse an existing open issue when the request matches the same work item.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/workflow-routing.md", renderRuleDocumentMarkdown({
      title: "Workflow Routing",
      ruleId: "workflow-routing",
      scope: "Map requests to issues, workflows, or rule approval paths.",
      policy: [
        "Route review, bugfix, refactor, planning, and performance work to their workflows.",
        "Route durable convention changes to rule approval instead of one-off issue creation.",
        "Do not create duplicate issues when a matching open issue already exists.",
        "Only create new issues when a real task is being started.",
      ],
      examples: [
        "Performance improvement -> refactoring workflow.",
        "React convention change -> rule approval path.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/definition-of-done.md", renderRuleDocumentMarkdown({
      title: "Definition of Done",
      ruleId: "definition-of-done",
      scope: "Define the minimum evidence required before closing work.",
      policy: [
        "Use the detected build, test, and lint commands when they exist.",
        "Keep workflow state and issue logs aligned before closing.",
        "Log Evidence Review before Close is allowed.",
        "Do not claim completion while a required gate is still blocked.",
      ],
      examples: [
        "Attach tests and command output for a code change.",
        "Include documentation updates when behavior changes.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/evidence-policy.md", renderRuleDocumentMarkdown({
      title: "Evidence Policy",
      ruleId: "evidence-policy",
      scope: "Decide what counts as proof and how to record it.",
      policy: [
        "Prefer evidence from the detected source directories and docs.",
        "Capture build, test, and lint output when those commands exist.",
        "For performance work, record the baseline, a compact summary, the follow-up measurement, the comparison, the raw report path, and any follow-up issue.",
        "Keep evidence append-only in the issue log and note limitations clearly.",
      ],
      examples: [
        "Attach command output plus file references.",
        "Use docs/troubleshooting/performance-improvements.md when benchmark noise needs explanation.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/performance-improvement.md", renderRuleDocumentMarkdown({
      title: "Performance Improvement",
      ruleId: "performance-improvement",
      scope: "Handle performance work with repeatable measurements and comparison evidence.",
      policy: [
        "Capture a baseline before changing code.",
        "Measure the same workload or user flow after the change.",
        "Compare before and after using the same metric when possible.",
        "Write a compact summary that includes the scenario, baseline, after/result, workload or iterations, key metric, raw report path, limitations, and follow-up issue if any.",
        "Document environment noise, measurement limits, troubleshooting notes, and the raw artifact path.",
      ],
      examples: [
        "Latency regression -> collect p95 before and after the change.",
        "Noisy benchmark -> record the environment and rerun the measurement.",
      ],
      lastUpdated: currentState,
      notes: [
        "See docs/troubleshooting/performance-improvements.md for measurement guidance.",
        "See docs/troubleshooting/evidence-summary.md for the compact summary format.",
      ],
    })),
    artifact(".flowness/rules/git.md", renderRuleDocumentMarkdown({
      title: "Git Rules",
      ruleId: "git",
      scope: "Protect repository selection, commit scope, and dangerous git operations.",
      policy: [
        "Resolve the repository from the changed files, not from the process cwd.",
        "Stage only the intended files and keep commits tied to evidence review.",
        "Forbid `git add .`, `git commit -a`, force push, rebase, reset --hard, and merge by default.",
        "Avoid committing logs, temporary files, nested repo metadata, or generated noise.",
      ],
      examples: [
        "Use an explicit `git add -- <files>` list.",
        "Keep the commit gate after Evidence Review passes.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/commit-policy.md", renderRuleDocumentMarkdown({
      title: "Commit Policy",
      ruleId: "commit-policy",
      scope: "Define when and how a commit can be created.",
      policy: [
        "Commit only after the workflow evidence bar is met.",
        "Use concise conventional-style commit messages.",
        "Do not use `git add .` or `git commit -a`.",
        "Do not commit automatically before the workflow commit step.",
      ],
      examples: [
        "Stage approved files after the evidence review is logged.",
        "Use a human-approved commit gate for the final change set.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/workflow-step-contract.md", renderRuleDocumentMarkdown({
      title: "Workflow Step Contract",
      ruleId: "workflow-step-contract",
      scope: "Run exactly one valid workflow step at a time.",
      policy: [
        "Read the current step file and follow its `Next` link.",
        "Append logs instead of rewriting them.",
        "Never advance workflow state before appending the matching log entry.",
        "Stop and recover if the state and log disagree.",
      ],
      examples: [
        "Evidence Review must exist before Close can run.",
        "If a review fails, record the recovery path before retrying.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/project-overrides.md", renderRuleDocumentMarkdown({
      title: "Project Overrides",
      ruleId: "project-overrides",
      scope: "Record durable project-specific exceptions that override the defaults.",
      policy: [
        "Keep overrides minimal and explicit.",
        "Use this file only for stronger project-specific exceptions.",
        "Do not bury durable rule changes in issue logs or comments.",
        "Use the central rule update log when an override is approved or changed.",
      ],
      examples: [
        "Project wants strict feature slices for React work.",
        "Project needs a stricter evidence bar than the default.",
      ],
      lastUpdated: currentState,
    })),
    artifact(".flowness/rules/rule-update-log.md", [
      "# Rule Update Log",
      "",
      "- Rule ID: rule-update-log",
      "",
      "## Scope",
      "Append-only history for approved rule changes and rule file creation.",
      "",
      "## Policy",
      "- Record the rule id, source request, approval path, and target file for each change.",
      "- Keep this log append-only.",
      "- Do not add history blocks inside individual rule files.",
      "- Use the current-state rule file as the single source of truth for each rule.",
      "",
      "## Examples",
      "- Approved `tech/react` convention update.",
      "- Added `performance-improvement.md` after init.",
      "",
      "## Entries",
      "- None yet.",
      "",
      "## Last Updated",
      `- ${currentState}`,
      "",
    ].join("\n")),
    artifact(".flowness/rules/tech/README.md", [
      "# Tech Rules",
      "",
      "These files hold current-state language and framework guidance for the project.",
      "Use `project-overrides.md` for stronger project-specific exceptions and `rule-update-log.md` for history.",
      "",
      "## Files",
      "- `java.md`",
      "- `javascript.md`",
      "- `typescript.md`",
      "- `python.md`",
      "- `spring.md`",
      "- `react.md`",
      "- `nextjs.md`",
      "- `nestjs.md`",
      "- `django.md`",
      "",
    ].join("\n")),
    ...techRuleArtifacts,
  ];
}

export function renderGeneratedSkillArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".flowness/skills/root-cause-analysis.md", renderSkillMarkdown("Root Cause Analysis", analysis, [
      "Find the smallest reproducible cause before changing code.",
      "Use it when a command fails, a regression appears, or behavior is unclear.",
      "Reproduce the issue, isolate the path, and capture the evidence.",
      "Trace the failure through logs, tests, and relevant source files.",
      "Prefer a narrow explanation with file and line references.",
      "Record the failure mode and the likely fix path.",
      "The cause is explained and the next step is obvious.",
    ])),
    artifact(".flowness/skills/code-review.md", renderSkillMarkdown("Code Review", analysis, [
      "Review a pull request, patch, or change set before it lands.",
      "Use it when you need to find bugs, regressions, or missing tests.",
      "Read the diff, compare it with the request, and look for risky edges.",
      "Check whether the change matches the existing workflow and evidence rules.",
      "List hard blockers and deferrable blockers separately.",
      "Tie each finding back to concrete evidence.",
      "The review can be summarized with clear follow-up items.",
    ])),
    artifact(".flowness/skills/test-planning.md", renderSkillMarkdown("Test Planning", analysis, [
      "Plan tests before or after a change so the evidence path is clear.",
      "Use it when a task needs verification, regression coverage, or a gap analysis.",
      "Choose the smallest useful command set first.",
      "Use the detected test command when it exists.",
      "Call out missing fixtures, commands, or coverage gaps.",
      "Prefer commands that prove behavior rather than just compiling code.",
      "The test plan names the commands and evidence that matter.",
    ])),
    artifact(".flowness/skills/implementation-planning.md", renderSkillMarkdown("Implementation Planning", analysis, [
      "Turn a request into a small, safe implementation sequence.",
      "Use it when a task needs an execution plan before code changes start.",
      "Map the request to the workflow and the likely files involved.",
      "Note the build/test/lint commands that should validate the change.",
      "Keep the plan narrow enough to finish in one workflow pass.",
      "Flag uncertainty instead of inventing details.",
      "The implementation path is scoped and ready to execute.",
    ])),
    artifact(".flowness/skills/README.md", [
      "# Skills",
      "",
      "- `root-cause-analysis.md`",
      "- `code-review.md`",
      "- `test-planning.md`",
      "- `implementation-planning.md`",
      "",
      "Use these skills to keep issue work grounded in evidence and the detected project context.",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedTemplateArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".flowness/templates/issue-template.md", [
      "# Issue Template",
      "",
      "## Title",
      "Describe the issue in one sentence.",
      "",
      "## Type",
      "feature | bugfix | refactor | research | investigation | planning | mvp | harness | documentation | decision",
      "",
      "## Workflow",
      "The workflow id that should execute this issue.",
      "",
      "## Goal",
      "What outcome should this issue achieve?",
      "",
      "## Acceptance Criteria",
      "- List the smallest useful outcomes.",
      "",
      "## Dependencies",
      "- List the issues or decisions this work depends on.",
      "",
      "## Evidence Required",
      "- Link to commands, files, or screenshots that prove the work.",
      "",
      "## Parent / Child Relations",
      "- Parent issue id if this is a child issue.",
      "- Child issue ids if this is a planning issue.",
      "",
      "## Notes",
      "- Keep the issue focused and append-only.",
      "",
    ].join("\n")),
    artifact(".flowness/templates/issue-breakdown-template.md", [
      "# Issue Breakdown Template",
      "",
      "## Parent Issue",
      "Describe the planning issue that was reviewed.",
      "",
      "## Child Issues",
      "- Title",
      "- Type",
      "- Workflow",
      "- Goal",
      "- Acceptance Criteria",
      "- Dependencies",
      "- Evidence Required",
      "",
      "## Notes",
      "- Create only the issues that are approved by the reviewed plan.",
      "- Keep the parent/child relation explicit.",
      "",
    ].join("\n")),
    artifact(".flowness/templates/decision-template.md", [
      "# Decision Template",
      "",
      "## Context",
      "Describe the situation and why a decision is needed.",
      "",
      "## Options",
      "- Option 1",
      "- Option 2",
      "",
      "## Decision",
      "State the chosen option clearly.",
      "",
      "## Consequences",
      "- What changes.",
      "- What remains open.",
      "",
      "## Evidence",
      `- Use \`${analysis.testCommand ?? "TODO: detect test command"}\` or other project evidence when relevant.`,
      "",
    ].join("\n")),
    artifact(".flowness/templates/review-template.md", [
      "# Review Template",
      "",
      "## Scope",
      "Summarize the review target and the files or change set being reviewed.",
      "",
      "## Target",
      "- Current working tree",
      "- Staged diff",
      "- Last commit",
      "- Specific files",
      "- Active issue changes",
      "- PR or branch",
      "",
      "## Findings",
      "- Blocking: yes / no",
      "- Deferrable: yes / no",
      "- Hard blockers",
      "- Deferrable blockers",
      "- Finding statuses: open, addressed, closed, deferred, accepted-risk",
      "- Follow-up issue: required or none",
      "- User approval: required before commit for deferred or accepted-risk findings",
      "",
      "## Perspective Results",
      "- Architecture Reviewer",
      "- Correctness Reviewer",
      "- Security Reviewer",
      "- Test Coverage Reviewer",
      "- Maintainability Reviewer",
      "- Performance Reviewer",
      "- Documentation Reviewer",
      "",
      "## Evidence",
      `- Use the detected commands when available: ${analysis.testCommand ?? "TODO"}, ${analysis.buildCommand ?? "TODO"}.`,
      "- For performance-sensitive changes, include a compact summary with the scenario, baseline, after/result, workload or iterations, key metric, raw report path, limitations, and follow-up issue if any.",
      "",
      "## Follow-up",
      "List the smallest next action, the follow-up issue suggestion, any review limitations, and any approval text that was recorded.",
      "",
    ].join("\n")),
    artifact(".flowness/templates/finding-template.md", [
      "# Finding Template",
      "",
      "## ID",
      "ARCH-001",
      "",
      "## Perspective",
      "Architecture Reviewer",
      "",
      "## Severity",
      "critical | high | medium | low",
      "",
      "## Blocking",
      "yes | no",
      "",
      "## Deferrable",
      "yes | no",
      "",
      "## Status",
      "open | addressed | closed | deferred | accepted-risk",
      "",
      "## Blocker kind",
      "hard | deferrable | none",
      "",
      "## File/path",
      "path/to/file.ts",
      "",
      "## Evidence",
      "- Link to the smallest file, log entry, or command output that proves the finding.",
      "",
      "## Problem",
      "State the issue in one sentence.",
      "",
      "## Actual",
      "State the behavior that did happen or the mismatch that was observed.",
      "",
      "## Recommendation",
      "- State the smallest safe change.",
      "",
      "## Follow-up issue",
      "required | none | ISSUE-123-EXAMPLE",
      "",
      "## User approval",
      "required before commit | not required",
      "",
      "## Requires follow-up issue",
      "yes | no",
      "",
      "## Rationale",
      "Explain why this finding matters.",
      "",
      "## Regression Test",
      "- State the command or test that should prevent the regression from returning.",
      "",
    ].join("\n")),
    artifact(".flowness/templates/log-entry-template.md", [
      "# Log Entry Template",
      "",
      "## Timestamp",
      "YYYY-MM-DDTHH:MM:SSZ",
      "",
      "## Step",
      "The step name.",
      "",
      "## Actions",
      "- What changed or what was inspected.",
      "",
      "## Evidence",
      "- The files, commands, or outputs that matter.",
      "",
      "## Summary",
      "A short statement of the result.",
      "",
      "## Next Step",
      "The next workflow step or `none`.",
      "",
    ].join("\n")),
    artifact(".flowness/templates/README.md", [
      "# Templates",
      "",
      "- `issue-template.md`",
      "- `issue-breakdown-template.md`",
      "- `decision-template.md`",
      "- `review-template.md`",
      "- `finding-template.md`",
      "- `log-entry-template.md`",
      "",
      "These templates are small, project-aware starting points for issue work.",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedWorkflowArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  const artifacts: ScaffoldArtifact[] = [
    artifact(".flowness/workflows/README.md", [
      "# Workflows",
      "",
      "- `feature-development/`",
      "- `code-review/`",
      "- `bug-fix/`",
      "- `refactoring/`",
      "- `mvp-planning/`",
      "",
      "Each workflow folder contains ordered markdown step files that describe the path from intake to closure.",
      "",
    ].join("\n")),
  ];

  for (const workflow of workflowSpecs) {
    artifacts.push(
      artifact(`.flowness/workflows/${workflow.id}/README.md`, renderWorkflowReadme(workflow, analysis)),
    );

    for (let index = 0; index < workflow.steps.length; index += 1) {
      const step = workflow.steps[index];
      if (step === undefined) {
        continue;
      }
      const previousStep = workflow.steps[index - 1] ?? null;
      const nextStep = workflow.steps[index + 1] ?? null;
      artifacts.push(
        artifact(
          `.flowness/workflows/${workflow.id}/${step.fileName}`,
          renderWorkflowStepMarkdown(workflow, step, previousStep, nextStep, analysis),
        ),
      );
    }
  }

  return artifacts;
}

export function renderGeneratedScriptArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".flowness/scripts/flowness-runner.ts", [
      "#!/usr/bin/env node",
      "",
      "import { spawnSync } from \"node:child_process\";",
      "",
      "function run(command: string, args: readonly string[]): number {",
      "  const result = spawnSync(command, [...args], {",
      "    stdio: \"inherit\",",
      "    encoding: \"utf8\",",
      "  });",
      "",
      "  if (result.error !== undefined) {",
      "    const error = result.error as { code?: string; message?: string };",
      "    if (error.code === \"ENOENT\") {",
      "      return 127;",
      "    }",
      "",
      "    console.error(error.message ?? \"Failed to run Flowness CLI.\");",
      "    return 1;",
      "  }",
      "",
      "  return result.status ?? 0;",
      "}",
      "",
      "function main(): number {",
      "  const request = process.argv.slice(2).join(\" \").trim();",
      "  if (request.length === 0) {",
      "    console.error('Usage: npx tsx .flowness/scripts/flowness-runner.ts \"<request>\"');",
      "    return 1;",
      "  }",
      "",
      "  const attempts: readonly (readonly [string, readonly string[]])[] = [",
      "    [\"flowness\", [\"run\", request]],",
      "    [\"npx\", [\"flowness\", \"run\", request]],",
      "    [\"npm\", [\"exec\", \"flowness\", \"--\", \"run\", request]],",
      "  ];",
      "",
      "  for (const attempt of attempts) {",
      "    const [command, args] = attempt;",
      "    const code = run(command, args);",
      "    if (code !== 127) {",
      "      return code;",
      "    }",
      "  }",
      "",
      "  console.error('Flowness CLI was not found. Install or link `flowness`, then run the command again.');",
      "  return 1;",
      "}",
      "",
      "process.exitCode = main();",
      "",
    ].join("\n")),
    artifact(".flowness/scripts/workflow-guard.ts", [
      "#!/usr/bin/env node",
      "",
      "import { existsSync } from \"node:fs\";",
      "import { spawnSync } from \"node:child_process\";",
      "import { join } from \"node:path\";",
      "",
      "function run(command: string, args: readonly string[]): number {",
      "  const result = spawnSync(command, [...args], {",
      "    stdio: \"inherit\",",
      "    encoding: \"utf8\",",
      "  });",
      "",
      "  if (result.error !== undefined) {",
      "    const error = result.error as { code?: string; message?: string };",
      "    if (error.code === \"ENOENT\") {",
      "      return 127;",
      "    }",
      "",
      "    console.error(error.message ?? \"Failed to run Flowness CLI.\");",
      "    return 1;",
      "  }",
      "",
      "  return result.status ?? 0;",
      "}",
      "",
      "function main(): number {",
      "  const rootDir = process.cwd();",
      "  const configPaths = [",
      "    join(rootDir, \".flowness\", \"config\", \"project.yaml\"),",
      "    join(rootDir, \".agent\", \"config.yaml\"),",
      "    join(rootDir, \".agent\", \"config\", \"project.yaml\"),",
      "  ];",
      "  if (!configPaths.some((configPath) => existsSync(configPath))) {",
      "    console.error('Flowness project is not initialized. Run `flowness init` first.');",
      "    return 1;",
      "  }",
      "",
      "  const workflowId = process.argv.slice(2).filter((token) => !token.startsWith(\"-\")).at(0);",
      "  const commandArgs = workflowId === undefined",
      "    ? [\"validate\"]",
      "    : [\"workflow:validate\", workflowId];",
      "",
      "  const attempts: readonly (readonly [string, readonly string[]])[] = [",
      "    [\"flowness\", commandArgs],",
      "    [\"npx\", [\"flowness\", ...commandArgs]],",
      "    [\"npm\", [\"exec\", \"flowness\", \"--\", ...commandArgs]],",
      "  ];",
      "",
      "  for (const attempt of attempts) {",
      "    const [command, args] = attempt;",
      "    const code = run(command, args);",
      "    if (code !== 127) {",
      "      return code;",
      "    }",
      "  }",
      "",
      "  console.error('Flowness CLI was not found. Install or link `flowness`, then run `flowness validate` manually.');",
      "  return 1;",
      "}",
      "",
      "process.exitCode = main();",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedHookArtifacts(_analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [];
}

export function renderGeneratedScriptsReadmeMarkdown(analysis: ProjectAnalysis): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";

  return [
    "# Scripts",
    "",
    "After `flowness init`, treat these scripts as agent-facing helpers and manual escape hatches rather than the normal human workflow.",
    "",
    "Use the TypeScript runner when you want a local protocol helper:",
    "",
    '```bash',
    'npx tsx .flowness/scripts/flowness-runner.ts "<request>"',
    '```',
    "",
    "Use the workflow guard when you want to validate the workspace or a specific workflow:",
    "",
    '```bash',
    "npx tsx .flowness/scripts/workflow-guard.ts",
    '```',
    "",
    "Fallback to the Flowness CLI when TSX is unavailable:",
    "",
    '```bash',
    'flowness run "<request>"',
    '```',
    "",
    "## Workspace Scripts",
    "- `flowness-runner.ts` routes a request through Flowness.",
    "- `workflow-guard.ts` validates the workspace or a workflow id.",
    "- `find-fqcn.py` searches for fully qualified names and references.",
    "- `search-reference.py` searches for file and symbol references.",
    "- `check-md-size.py` checks Markdown size thresholds.",
    "",
    "## Project Commands",
    `- Build: ${buildCommand}`,
    `- Test: ${testCommand}`,
    `- Lint: ${lintCommand}`,
    "",
    "## Notes",
    "- Keep helper scripts small and deterministic.",
    "- If a command is missing, add a TODO instead of guessing.",
    "- Read `.flowness/navigation.md` before broad file searching or manual navigation.",
    "- Use `flowness step --issue ISSUE-ID`, `flowness status --issue ISSUE-ID`, and `flowness evidence:add ...` as workflow escape hatches instead of editing workflow JSON by hand.",
    "",
  ].join("\n");
}
