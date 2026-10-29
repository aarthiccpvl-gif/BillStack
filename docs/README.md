# Documentation Index — Internal Invoice & Quotation Management System

Phases 1–8 are implemented. Phase 9 (hardening and handover) and the gaps found during the
post-implementation review are tracked in [12-pending-work-plan.md](12-pending-work-plan.md).

| Doc | Contents |
|---|---|
| [00-architecture-overview.md](00-architecture-overview.md) | Layered architecture, runtime topology, monorepo layout, cross-cutting concerns, env vars, Docker, testing |
| [01-data-model-erd.md](01-data-model-erd.md) | ER diagram, entity catalogue, relationships, snapshot/retention principles |
| [02-prisma-schema-design.md](02-prisma-schema-design.md) | Full proposed Prisma schema (design draft, not yet wired) |
| [03-financial-tax-engine.md](03-financial-tax-engine.md) | Decimal policy, canonical calculation algorithm, GST engine, currency & FX |
| [04-numbering-financial-year.md](04-numbering-financial-year.md) | Financial years, configurable numbering, concurrency-safe sequences |
| [05-api-specification.md](05-api-specification.md) | REST conventions, error codes, complete endpoint list with required permissions |
| [06-auth-rbac-audit-revision.md](06-auth-rbac-audit-revision.md) | Authentication, permission catalogue, role matrix, audit log, revision history |
| [07-template-pdf-engine.md](07-template-pdf-engine.md) | Template config schema, versioning, renderer, preview/PDF parity, Puppeteer |
| [08-frontend-architecture.md](08-frontend-architecture.md) | Module & route structure, state management, document editor + live preview |
| [09-roadmap.md](09-roadmap.md) | Phase plan 1–8 with deliverables, exit criteria and tests |
| [10-open-questions.md](10-open-questions.md) | Contradictions, gaps, risks, and the questions raised before Phase 1 |
| [11-decisions.md](11-decisions.md) | **Decision log** — the answers to those questions and what each one changed |
| [12-pending-work-plan.md](12-pending-work-plan.md) | **Pending work** — Phase 9, production readiness and the gaps found after phases 1–8 |
| [13-operations.md](13-operations.md) | **Operations** — production deploy, migrations, seed, backup, restore, upgrades |

Source of truth: `../Internal Invoice & Quotation Management System — Product Requirements Document.md` (PRD v2.0).
