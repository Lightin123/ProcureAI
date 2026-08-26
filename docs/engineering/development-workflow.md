# Development Workflow

**Status:** Confirmed process for this project.

## Per-Feature Process

Before implementing a significant feature:

1. Understand the requirement.
2. Inspect the existing implementation.
3. Create/update relevant documentation in `docs/`.
4. Propose an implementation plan.
5. Wait for approval when appropriate.
6. Implement the smallest useful version.
7. Test it.
8. Review the implementation.
9. Commit the changes.
10. Open a Pull Request.
11. Review before merging into `main`.

## Rules

- Do not implement multiple unrelated features in one step.
- Keep the project runnable after each milestone.
- Do not modify unrelated files while implementing a feature.
- Build incrementally using vertical slices, per
  [../product/product.md](../product/product.md).

## Documentation Rule

`docs/` is the project's source of truth for detailed project decisions and
specifications. Before implementing a feature, check whether relevant
documentation already exists.

If an implementation decision changes architecture, requirements, database
design, API design, the AI pipeline, UI design, or development process, the
relevant Markdown documentation must be updated in the same change. Do not
let documentation and implementation drift apart.

`CLAUDE.md` at the repository root stays concise: essential coding
instructions plus links into `docs/`, not a duplicate of the detailed specs.

## Related Documents

- [git-workflow.md](git-workflow.md)
- [testing-strategy.md](testing-strategy.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../../CLAUDE.md](../../CLAUDE.md)
