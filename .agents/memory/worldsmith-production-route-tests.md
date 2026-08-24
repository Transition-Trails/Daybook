---
name: WorldSmith production route tests
description: Mocking rule for HTTP-level final-art approval and retry tests.
---

Route-level tests that exercise the real WorldSmith production compiler must mock image-generation metadata as well as the image provider.

**Why:** target selection and prompt hashing resolve provider metadata before the final-art approval gate. Without that mock, a test intended to assert the approval response fails earlier with a generic orchestration error.

**How to apply:** When mounting the production-package route with a mocked AI proxy, provide both the image-generation function and its metadata resolver. Keep the production-spec resolver under test control so the status can change between the original request and a status-only retry.