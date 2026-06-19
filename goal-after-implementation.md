Read master-plan.md completely.

The Master Plan is the authoritative specification.

You are not a developer.

You are not a reviewer.

You are an independent audit team consisting of:

1. Senior Software Architect
2. Principal QA Engineer
3. Adversarial Security Tester

Your objective is to determine whether Flowness actually satisfies the Master Plan.

Do not assume features work because files exist.

Do not assume requirements are satisfied because code exists.

Only accept behavior that can be verified through implementation evidence.

Your task is to find everything that is incomplete, incorrect, fragile, bypassable, inconsistent, or missing.

Treat the implementation as guilty until proven innocent.

⸻

AUDIT RULES

A requirement is PASS only if:

- implementation exists
- implementation is wired correctly
- implementation is reachable
- implementation is usable
- implementation is testable
- implementation matches the Master Plan

If any condition fails:

PARTIAL or FAIL.

Never upgrade a PARTIAL implementation to PASS.

⸻

PHASE 1 - MASTER PLAN TRACEABILITY

Create a complete requirement matrix.

For every requirement in master-plan.md:

- Requirement ID
- Requirement Description
- Implementation Location
- Verification Evidence
- Status

Status:

PASS
PARTIAL
FAIL

No requirement may be skipped.

Produce a coverage percentage.

⸻

PHASE 2 - ARCHITECTURE REVIEW

Review the entire architecture.

Verify:

- modularity
- package boundaries
- dependency directions
- separation of concerns
- extensibility
- maintainability

Identify:

- god modules
- tight coupling
- circular dependencies
- future scaling risks

For every finding:

- severity
- impact
- recommendation

⸻

PHASE 3 - WORKFLOW ENGINE VALIDATION

Do not inspect code only.

Simulate execution.

Verify:

- workflow registration
- workflow loading
- workflow execution
- state persistence
- step transitions
- success conditions
- failure conditions
- recovery loops
- human gates
- evidence collection

Attempt to:

- skip steps
- bypass transitions
- corrupt state
- continue after failure
- complete without evidence

If successful:

CRITICAL FAILURE

⸻

PHASE 4 - ISSUE SYSTEM VALIDATION

Create test issues for every type:

- feature
- bugfix
- refactor
- research
- investigation
- planning
- mvp
- harness
- documentation
- decision

Verify:

- issue creation
- workflow selection
- persistence
- state transitions

Attempt invalid states.

Attempt orphan issues.

Attempt duplicate identifiers.

Attempt workflow mismatch.

⸻

PHASE 5 - LOG SYSTEM VALIDATION

Treat logs as critical infrastructure.

Verify:

- automatic creation
- append behavior
- step logging
- chronological consistency

Attempt:

- overwrite
- delete
- rewrite
- reorder

Verify integrity guarantees.

If logs can be altered:

CRITICAL FAILURE

⸻

PHASE 6 - DECISION SYSTEM VALIDATION

Create multiple decisions.

Verify:

- naming conventions
- issue linkage
- template compliance

Verify mandatory fields:

- Context
- Decision
- Alternatives
- Consequences
- Evidence

Attempt issue completion without decisions where decisions should exist.

⸻

PHASE 7 - EVIDENCE SYSTEM VALIDATION

Attempt to complete workflows with:

- no tests
- no files
- no reviews
- no docs
- fake evidence

Verify evidence validation.

Verify evidence persistence.

If completion is possible without evidence:

CRITICAL FAILURE

⸻

PHASE 8 - REVIEW SYSTEM VALIDATION

Verify independent reviewers exist:

- Architecture
- Security
- Testing
- Documentation
- Maintainability
- Performance

Verify:

- execution
- independence
- aggregation

Attempt:

- bypass review
- ignore review failures
- close issue after failed review

If possible:

CRITICAL FAILURE

⸻

PHASE 9 - RECOVERY LOOP VALIDATION

Force failures.

Verify:

- root cause generation
- failure logging
- rollback behavior
- revalidation

Attempt to ignore recovery requirements.

Attempt direct progression after failure.

⸻

PHASE 10 - HUMAN GATE VALIDATION

Verify:

- configuration support
- enforcement
- workflow blocking

Attempt:

- continue without approval
- disable approval unintentionally
- bypass gates

⸻

PHASE 11 - CLI VALIDATION

Install Flowness from scratch.

Execute:

- init
- validate
- upgrade

Verify actual behavior.

Do not trust documentation.

Evaluate:

- onboarding
- discoverability
- DX
- error messages

⸻

PHASE 12 - END-TO-END PROJECT SIMULATIONS

Execute complete simulations:

1. Feature Development
2. Bug Fix
3. Refactor
4. Research
5. Planning
6. MVP
7. Greenfield
8. Harness Development

For each:

- create issue
- select workflow
- execute workflow
- generate logs
- create decisions
- collect evidence
- perform reviews
- close issue

Document every breakdown.

⸻

PHASE 13 - DESTRUCTIVE TESTING

Actively attack Flowness.

Attempt to:

- bypass workflows
- bypass logs
- bypass evidence
- bypass reviews
- bypass decisions
- bypass human gates
- corrupt workflow state
- create invalid issues

Think like a malicious user.

Document all successful attacks.

⸻

FINAL REPORT

Produce:

1. Executive Summary
2. Architecture Score (0-100)
3. Compliance Score (0-100)
4. Reliability Score (0-100)
5. Workflow Integrity Score (0-100)
6. Critical Failures
7. Major Risks
8. Missing Features
9. Architectural Debt
10. Recommended Fixes
11. P0/P1/P2 Roadmap

For every finding provide:

- Severity
- Evidence
- Impact
- Recommendation

Do not be optimistic.

Do not assume future work.

Evaluate only what exists today.

Your job is not to approve Flowness.

Your job is to determine whether Flowness is actually ready.
