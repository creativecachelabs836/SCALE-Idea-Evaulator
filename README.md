# S.C.A.L.E. Strategic Evaluator

Turns a 75-word description of an idea into an evidence-backed strategic thesis:
autonomous research, customer analysis, value-chain mapping, innovation
classification, a six-factor evaluation, recommended experiments, a 90-day plan,
and a branded executive report.

**A description of at least 75 words is the only required input.** Everything
else is inferred, and labelled as inferred.

---

## Status

**Iteration 1 complete — the evaluation contract.** The canonical data model,
the six-dimension scorecard, and the validation boundary exist and are covered
by 45 tests. No UI, persistence or model calls yet; Iteration 2 renders a full
evaluation on screen.

The plan lives in **[SPEC.md](./SPEC.md)** — product thesis, the S.C.A.L.E.
methodology, the principles we build under, and the iteration roadmap with
acceptance criteria. Read it before writing code.

## Quick start

```bash
./scripts/launch.sh
```

Checks your Node version, installs dependencies, creates `.env.local`, verifies
the port is free, and starts the app at <http://localhost:3000>. Re-running is
cheap — every step is skipped when it is already done.

```bash
./scripts/launch.sh --prod --port 8080    # production build, then serve
./scripts/launch.sh --check               # typecheck and tests first
./scripts/launch.sh --open                # open a browser when ready
./scripts/launch.sh --help                # all options
```

| Script | Purpose |
| --- | --- |
| `npm run launch` | Preflight checks, then the development server |
| `npm run launch:prod` | Preflight checks, production build, then serve |
| `npm run dev` | Development server only, no preflight |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | The test suite |

On Windows, run the launch script under WSL or Git Bash, or use `npm run dev`.

## Layout

```
README.md          You are here
SPEC.md            The plan: methodology, principles, iteration roadmap
scripts/launch.sh  Preflight checks and server startup
src/app/           Next.js App Router pages
src/domain/        The evaluation contract: schema, scoring, validation, assembly
tests/             Test suite and its module-resolution harness
```

Directories arrive as the iterations that need them do. There are no empty
placeholder folders, because a folder that contains nothing teaches nothing.

## Testing

```bash
npm test
```

Tests run on Node's built-in runner with native TypeScript stripping — no build
step and no test framework dependency. `tests/loader.mjs` teaches Node the
`@/*` path alias and extensionless imports that the bundler resolves natively.

New test files are picked up automatically: anything matching `tests/*.test.ts`.

Two rules worth stating up front, both of which have already caught real
defects:

- **Where behaviour is derived from input, test across many inputs, not one
  example** (P7). The scoring tests enumerate all 15,625 score combinations
  rather than sampling.
- **A test never seen failing proves nothing** (P9). Before claiming a guarantee
  is covered, break it deliberately and watch the suite go red.

## How this repository is meant to be used

This is built iteratively. Each iteration in [SPEC.md](./SPEC.md) is small
enough to review in one sitting and ends in something you can look at and use.

The spec is a living document, not a contract with a past version of ourselves.
When an iteration teaches us the plan was wrong, the plan changes in the same
commit as the code.
