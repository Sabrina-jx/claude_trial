---
name: grilling
description: "Shared design-tree protocol for structured interviews. Provides the tree visualization and traversal mechanics used by grill-me and other interview skills. Not invoked directly by users."
---

# Design-Tree Interview Protocol

A shared protocol for systematically interviewing a user about a plan or design. The tree represents every decision point; the interview resolves them one branch at a time.

## Tree Format

Print the tree as an indented outline with status markers:

```
[ ] Unresolved — not yet discussed
[→] Active — currently being discussed
[✓] Resolved — decision made and agreed upon
```

Example:

```
Design Tree
├── [✓] Data storage
│   ├── [✓] Database engine: PostgreSQL
│   └── [✓] Schema versioning: migrations via Alembic
├── [→] API layer
│   ├── [→] Framework choice
│   ├── [ ] Authentication method
│   └── [ ] Rate limiting strategy
├── [ ] Deployment
│   ├── [ ] Hosting platform
│   ├── [ ] CI/CD pipeline
│   └── [ ] Monitoring & alerting
└── [ ] Testing strategy
    ├── [ ] Unit test framework
    └── [ ] Integration test approach
```

## Traversal Rules

1. **Print the full tree before the first question.** Build it by analyzing the user's plan/design and identifying every decision point. Group related decisions into branches.

2. **Traverse depth-first, one branch at a time.** Mark the current node `[→]`. Don't jump to a sibling until the current branch is resolved.

3. **Resolve dependencies first.** If a decision depends on another unresolved decision, move to the dependency, resolve it, then return.

4. **Reprint the full tree whenever its shape or status changes** — when a node is resolved `[✓]`, when new sub-decisions are discovered and added, or when moving to a new branch. This keeps the user oriented.

5. **One question at a time.** Each turn asks exactly one question about the active `[→]` node. Provide your recommended answer with brief reasoning. Wait for the user's response before moving on.

6. **Discover new branches as you go.** When a user's answer reveals sub-decisions that weren't in the original tree, add them as children of the current node and traverse them before moving on.

7. **Mark resolved and move on.** When the user agrees or decides, mark the node `[✓]` with the decision noted inline (e.g., `[✓] Database engine: PostgreSQL`). Then advance to the next unresolved node.

## Question Style

- Be direct and specific. "Which database engine?" not "Have you thought about data storage?"
- Always provide a recommended answer with one sentence of reasoning.
- If the codebase can answer the question (existing config, dependencies, patterns), check first and state what you found instead of asking.
- Challenge vague answers. If the user says "whatever works," push for a concrete choice.
- Flag risks and tradeoffs. If a decision has non-obvious consequences, say so.

## Completion

When all nodes are `[✓]`, print the final resolved tree as a summary of all decisions made. This serves as a lightweight design document the user can reference.
