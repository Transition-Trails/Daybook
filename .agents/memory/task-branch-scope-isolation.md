---
name: Task branch scope isolation
description: Avoid completion-review scope contamination from inherited work on the task branch.
---

Before completing a focused task, inspect the cumulative branch diff against `origin/main`, not only the diff against the current `main-repl/main` rebase target. If inherited commits alter unrelated product behavior, restore those paths to the baseline so the submitted branch contains only the assigned scope.

**Why:** Completion review can evaluate inherited task-branch commits even when the working tree is clean and the latest commit contains only focused changes. A diff against the rebase target can therefore look correct while the submitted branch still carries unrelated regressions.

**How to apply:** Before the final completion callback, compare both changed paths and commit history against `origin/main`. Preserve the assigned feature and deliberately neutralize unrelated inherited files or assets, then rerun validation against the resulting cumulative tree.