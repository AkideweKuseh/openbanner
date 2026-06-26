---
name: 🐛 Bug report
about: Something isn't working as expected
title: "[bug] "
labels: bug
---

## Describe the bug

<!-- A clear description of what the bug is. -->

## Steps to reproduce

1.
2.
3.

## Expected vs. actual behaviour

**Expected:** <!-- what you thought would happen -->
**Actual:** <!-- what happened instead -->

## Environment

- OpenBanner version / commit: <!-- e.g. `v1.0.0` or a commit SHA -->
- How you're running it: <!-- Docker (prod compose) / Docker (dev compose) / bare Node -->
- OS + architecture: <!-- e.g. Ubuntu 24.04 x86_64 -->
- Node version (if running the API bare):
- Browser (for UI issues):

## Logs / output

<!--
Paste any relevant logs, the API response (status + body), or a rendered image that shows
the problem. Redact secrets / API keys first!
-->

```
(paste here)
```

## Reproducible request (for API bugs)

<!-- If it's an API issue, include the exact request body and headers (minus the API key). -->

```bash
curl -X POST ... \
  -H "X-API-Key: ***" \
  -d '{...}'
```
