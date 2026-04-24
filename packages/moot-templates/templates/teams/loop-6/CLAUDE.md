# {project_name}

TODO: Describe your project. What does it do? What problem does it solve?

## Direction

### Mission

TODO: Why this project exists. What humans + agents accomplish together here.

### Values

TODO: Operational values that guide code, docs, and decisions.

## Operating

### Roles

{role_count} agents collaborate on this project: {role_list}. They communicate via the Convo shared context server. Pipeline agents use Claude Code. Product coordinates strategy; Leader orchestrates the operational pipeline; Librarian observes asynchronously for docs.

{role_descriptions}

### Topology

Product handles strategic direction and is operator-facing. Leader handles operational orchestration -- day-to-day git operations, pipeline monitoring, ship coordination. Product makes design decisions; Leader executes.

The Librarian is an async observer -- it monitors the pipeline for shipped features and updates documentation, but does not block the main work pipeline. Librarian communicates with Product via a dedicated side thread.

### Resource ownership

{resource_ownership}

## Project reference

### Status

TODO: What works, what doesn't. Update as the project evolves.

### Tech stack

TODO: Language, frameworks, databases, build tools.

### Running

TODO: How to run the project, run tests, build, deploy.

### Code conventions

TODO: Formatting, linting, type checking, naming conventions.

## Operational practice

### Git workflow

{git_description}

### Handoff discipline

TODO: How agents coordinate work -- channel mentions, branch names, merge protocol.
