---
name: GitHub connector tree sync
description: Reliable fallback publishing through the GitHub connector when ordinary git push credentials fail.
---

When GitHub must be updated through the connector, upload changed blobs in small
batches and compare each returned SHA with the exact local committed blob SHA.
Build a tree from the verified blobs on top of the current remote head, verify
the changed tree entries, then create a commit and update the ref with
`force: false`.

**Why:** The connector sandbox can reject a large durable-to-connector payload
even though individual Git blob and tree API calls are valid. Shell callback
output can also normalize Git's tab separators and retain carriage returns, so
do not use its default `git diff --name-status` or `git ls-tree` formatting as
a direct data protocol.

**How to apply:** Use delimiter-safe Git output or direct `git rev-parse
HEAD:<path>` to get local blob IDs. Re-read the remote ref immediately before
the update, stop if it changed, and only align the local branch to the remote
after confirming their tree IDs are identical.