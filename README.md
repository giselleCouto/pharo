# Pharos

Decision-support system for multi-port cabotage routing, fleet planning and operational cost simulation.

Pharos translates a complex maritime logistics problem into a structured optimization workflow. The system combines demand grouping, port sequencing, tide and draft constraints, vessel availability, bunker cost, demurrage and scenario analysis to support tactical planning decisions.

## Why This Project Matters

Maritime cabotage planning is a constrained decision problem: each route must satisfy operational windows, vessel capacity, port restrictions, draft safety, product segregation and cost targets. A spreadsheet-first approach quickly becomes fragile. Pharos demonstrates how mathematical modeling, heuristics and interactive analytics can be combined into a decision system.

## Core Capabilities

- Multi-port routing with operational constraints.
- Scenario simulation: optimistic, base, conservative and minimum-cost plans.
- Tide-aware and draft-aware validation by port and date.
- Demand grouping, replenishment windows and port sequencing.
- Bunker, time-charter, spot vessel and demurrage cost modeling.
- Web Worker optimization engine to keep the UI responsive.
- Exportable JSON output for downstream APIs or executive analysis.

## Technical Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Zustand
- Supabase
- Web Workers

## Optimization Architecture

The optimization engine runs in `src/lib/optimizer.worker.ts` and delegates domain logic to focused modules:

| Module | Responsibility |
| --- | --- |
| `ordering.ts` | Demand grouping, route sequencing and replenishment windows |
| `costs.ts` | Bunker, charter, spot vessel and demurrage cost modeling |
| `constraints.ts` | Draft, tide, port and product-segregation constraints |
| `tideEngine.ts` | Client-side harmonic tide estimation |
| `mare.ts` | Effective draft and tide-window calculations |

## Repository Structure

```text
src/
  api/             Backend and Supabase integrations
  components/      Reusable UI components
  data/            Mock data and default settings
  hooks/           React hooks for optimization and tenant context
  lib/
    optimizer/     Cost, ordering and constraint modules
    optimizer.ts
    optimizer.worker.ts
    tideEngine.ts
    mare.ts
    types.ts
  pages/           Application pages
supabase/
  edge_function/   Edge functions and tests
```

## Running Locally

```bash
npm install
npm run dev
```

The local app runs at `http://localhost:8080`.

Useful checks:

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json --strict
```

## Decision-Science Angle

This repository is a public example of applied mathematical modeling for operational decision support. It is especially relevant for:

- operations research
- fleet planning
- routing under constraints
- maritime logistics
- scenario simulation
- executive decision intelligence

## Author

Developed by [Giselle Couto Falcao, PhD](https://coutofalcao.com/giselle), researcher and consultant in applied AI, mathematical modeling, machine learning and decision systems.

