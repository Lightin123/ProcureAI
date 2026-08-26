# Git Workflow

**Status:** Confirmed process. The repository is initialized with a remote
at `origin` (GitHub: `Lightin123/ProcureAI`) and a `main` branch.

## Branching Model

- `main` is the protected production/integration branch.
- Never push directly to `main`.
- Never force-push to `main`.
- Develop using feature branches.

## Branch Naming

```
feat/<feature-name>
fix/<issue-name>
chore/<task-name>
docs/<documentation-name>
refactor/<feature-name>
test/<feature-name>
```

## Merging

- Changes reach `main` through Pull Requests only.
- Keep commits focused — do not mix unrelated features in one PR.
- Review before merging into `main`.

## Related Documents

- [development-workflow.md](development-workflow.md)
- [../../CLAUDE.md](../../CLAUDE.md)
