# Audit Findings

Current registry of the Flowness audit.

## Resolved Issues

- Workflow completion now requires real evidence.
- Workflow-state step skipping is rejected.
- Review failures block closure.
- Python and Shell workflow blueprints are supported.
- Human-gate instructions can be changed with `config:gate`.
- Prompt scaffolds and script scaffolds are generated during `init`.
- Issue logs are no longer overwritten by the issue scaffold path.
- `workflow:recover` now retries and revalidates after the root cause is recorded.
- Completed workflows are no longer blocked merely because `currentStep` becomes empty at completion.
- Requests can be captured automatically from freeform CLI input.
- Skills and rules now have runtime execution/discovery commands.
- Reviewers now execute in isolated subprocesses per role.

## Open Findings

None.

