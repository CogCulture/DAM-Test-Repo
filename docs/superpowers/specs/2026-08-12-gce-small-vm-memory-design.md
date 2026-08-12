# GCE Small-VM Memory Design

## Context

The production VM has 3.8 GiB of RAM. The existing GCP Compose profile limits the DAM container to 6 GiB, which assumes an 8 GiB VM and can expose the 4 GiB host to out-of-memory termination.

## Approved design

- Configure the DAM container memory limit through `DAM_MEMORY_LIMIT`.
- Use `3g` when the variable is absent, matching the current 3.8 GiB VM while leaving capacity for Ubuntu, Docker, and a host reverse proxy.
- Apply the same value to Compose's service-level `mem_limit` and deploy resource limit so the two declarations cannot drift.
- Document `DAM_MEMORY_LIMIT=3g` in `.env.gcp.example` and the GCP runbook.
- Preserve one application replica, SQLite, `/var/lib/dam`, Google identity login, and all existing DAM features.
- Treat concurrent or large RAG/document-processing workloads as constrained on this VM. Increase VM RAM and then raise `DAM_MEMORY_LIMIT` before enabling heavier concurrency.

## Verification

- A container-contract test must fail against the fixed `6g` configuration and pass only when both Compose limits consume `${DAM_MEMORY_LIMIT:-3g}`.
- The environment example must declare `DAM_MEMORY_LIMIT=3g`.
- The focused container tests and complete Node test suite must pass.
- `docker compose config` must render a 3 GiB limit with the example environment.

## Scaling

Memory scaling requires no application-code change. Resize the VM, update `DAM_MEMORY_LIMIT` in `.env.gcp`, and recreate the container. Keep enough host memory outside the container for Ubuntu, Docker, and the reverse proxy.
