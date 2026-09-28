---
name: GitHub publishing
description: Reliable repository publishing when the workspace remote credential is unavailable.
---

If a normal `git push` rejects the workspace credential, use the already-added
GitHub connector’s authenticated REST proxy rather than exposing or requesting a
token. Verify that remote `main` still equals the local commit parent before
creating a tree and advancing the ref without force.

When local `main` contains many commits absent from remote `main`, a connector
tree snapshot would collapse their history. In that case, first try a regular
non-force Git push using the workspace's already-configured `GITHUB_TOKEN`
through an ephemeral credential helper (never print or persist its value).
Do not use a connector snapshot as a substitute for that history-preserving
push without explicit agreement.

**Why:** The normal remote credential once rejected a fast-forward push of
hundreds of commits, while the workspace's existing token accepted the same
push. A tree-only connector update would have omitted the intermediate
commit history and diverged from the local branch.

**How to apply:** Check that the remote is an ancestor, the working tree is
clean, and the remote ref has not moved. Keep the credential out of the remote
URL, command arguments, logs, and files; pass it to Git only in process.
Verify the remote SHA equals the local SHA after the push.

**Why:** The workspace Git credential and the GitHub connector can have different
authorization state. The connector can safely authorize repository writes
without putting an OAuth token in shell history, remotes, chat, or project
files.

**How to apply:** Create blobs from the exact committed bytes, create a tree
from the verified remote parent, then create and non-force-update the commit
ref. For large files, avoid routing base64 through the durable shell callback:
read their bytes inside the connector sandbox and compare every resulting blob
SHA against `git rev-parse HEAD:<path>` before advancing the branch.