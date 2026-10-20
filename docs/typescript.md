# TypeScript rules

Core rule: **validate untrusted data once at the boundary, trust typed code everywhere else.**

Adapted from [this gist](https://gist.github.com/pipethedev/ff13d98a5b626f985708afb343723048). The gist is longer; read it when reviewing.

## Boundaries and validation
- Boundaries: HTTP, webhooks, queue messages, YouCam responses, LLM output, env vars, raw JSON columns, user input.
- Validate there with **zod** (already in the repo). Do not add another schema library or hand-written guards beside it.
- Internal objects are plain typed values. Do not re-validate them.
- Schemas and inferred types shared across apps live in `packages/types`.

## Types
- No `any`. Avoid `unknown` and `Record<string, unknown>` outside a boundary. Fix the type at its source rather than adding `asX()` helpers downstream.
- Model exclusive states as discriminated unions, not optional fields. Queue events and agent steps are unions.
- Fields are required unless the business meaning is optional. Avoid `Partial<T>` in domain logic; define the input type you actually need.
- Use `Record<KnownUnion, X>` when keys are known.
- One absence state (`undefined` or `null`), not both.
- A small, intentional `as` at a known integration point is fine. Five runtime checks to avoid one cast is not.

## Fallbacks and errors
- Never turn invalid state into `""`, `{}`, `[]` or `undefined`. Throw for required data; model real optionality in the type.
- Do not catch to hide. Catch only to translate, add context, clean up or recover on purpose.
- No `catch { throw error }`. No log-and-rethrow; log at one boundary.
- Keep real safety checks: external failures, not-found, nullable columns, malformed input, JSON parse, authorization, YouCam task errors inside HTTP 200.

## Structure
- No pass-through wrappers, one-use helpers, builders, factories, DI containers or interfaces with a single implementation.
- No `safe*`, `ensure*`, `normalize*`, `toRecord`, `getString` style helpers, and no generic converters or `String(x)` / `Number(x)` coercion on typed values.
- No `utils`/`helpers`/`common` dumping grounds. Put code in the domain that owns it.
- Do not duplicate near-identical DTO/model/payload types or write mappers between them.
- Plain functions over static-method classes. Duplication is cheaper than a wrong abstraction.
- NestJS dependency injection is the framework's, and is fine. Do not add your own containers, factories or single-implementation interfaces on top of it.

## Control flow and style
- Early returns. No nested ternaries.
- No needless `async`, `new Promise` wrappers, spreads or clones.
- No per-step debug logging.

## Comments and JSDoc
- A `//` comment says why: a business rule, an external quirk, an invariant, a trade-off. Never what the next line does. If a comment restates the code, delete it or rename the code.
- No commented-out code, no TODOs without an owner or issue, no change history (git has it).
- JSDoc is required on every exported function, class, schema and type that other modules use, and on public methods. It is how the next reader learns the contract without opening the body.
- A JSDoc block starts with one sentence on what the thing is for. Add only what the signature cannot say: `@param` for units, ranges or meaning that the name does not carry, `@returns` when the result is not obvious, `@throws` for errors callers must handle, `@example` for a non-obvious call. Do not repeat types, they are in the signature.
- Keep it short. A block longer than the code it describes is a sign to simplify the code. Do not add JSDoc to private helpers whose name and types already say it all.
- When behaviour changes, update the JSDoc in the same change. A wrong doc is worse than none.

## Review checklist
Before editing, name the trust boundaries and root-cause any broad type. After editing, ask of every helper, cast, branch and check whether it can be deleted. Refactors must not change behaviour, public APIs, event names, persistence formats or security checks.
