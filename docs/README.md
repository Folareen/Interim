# Interim docs

Each topic has one owner doc. Link to it instead of repeating it.

| Doc | Owns |
| --- | --- |
| [product/overview.md](product/overview.md) | What Interim is, who it serves, language and safety rules |
| [product/spec.md](product/spec.md) | Behaviour: templates, eligibility rules, agent loop, Stage Card, acceptance tests |
| [architecture.md](architecture.md) | System design: components, data model, queues, HTTP API, deployment |
| [typescript.md](typescript.md) | TypeScript rules for all code in this repo |
| [frontend/README.md](frontend/README.md) | Web app rules and conventions |
| [frontend/design-system.md](frontend/design-system.md) | Tokens, layout, components |
| [backend.md](backend.md) | NestJS, database, queue and error handling conventions |
| [agent.md](agent.md) | Implementation notes for the agent module |
| [llm.md](llm.md) | Model provider, prompts, guardrails |
| [integrations/youcam.md](integrations/youcam.md) | YouCam client, modes, costs, open questions |
| [development.md](development.md) | Local setup, scripts, testing |
| [git.md](git.md) | Branches, commits, pull requests |

When a doc conflicts with code, fix whichever is wrong in the same change.
