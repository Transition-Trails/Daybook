---
name: GitHub publishing
description: Reliable repository publishing when the workspace remote credential is unavailable.
---

If a normal `git push` rejects the workspace credential, use the already-added
GitHub connector’s authenticated REST proxy rather than exposing or requesting a
token. Verify that remote `main` still equals the local commit parent before
creating a tree and advancing the ref without force.

**Why:** The workspace Git credential and the GitHub connector can have different
authorization state. The connector can safely authorize repository writes
without putting an OAuth token in shell history, remotes, chat, or project
files.

**How to apply:** Create blobs from the exact committed bytes, create a tree
from the verified remote parent, then create and non-force-update the commit
ref. For large files, avoid routing base64 through the durable shell callback:
read their bytes inside the connector sandbox and compare every resulting blob
SHA against `git rev-parse HEAD:<path>` before advancing the branch.