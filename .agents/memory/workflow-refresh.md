---
name: Workflow refresh for server changes
description: How to diagnose a running preview that appears to use older server behavior.
---

When a server-side behavior contradicts the current source, verify the workflow's process start time and restart until the new process is serving the port. A successful restart message alone is not enough if an older child process remains attached.

**Why:** The login flow once continued using an older session-store behavior after source changes, producing database errors that were not present in the current auth module.

**How to apply:** Check workflow logs and the server process after server changes; only trust endpoint tests after the process start time and logs reflect the current restart.