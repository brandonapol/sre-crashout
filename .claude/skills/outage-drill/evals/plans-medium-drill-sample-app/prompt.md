---
tags: [outage-drill]
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

There's a small service in ./orders-api that my team will be on call for soon. I don't have a cluster handy right now, so don't deploy anything yet. Design a medium-difficulty outage drill for it: pick the fault, write the exact change you'd make (as a patch file, don't modify the repo itself), and write the facilitator answer key to ./answer-key/orders-api/medium.md. Keep the answer key out of the orders-api folder because the team will have that repo.

Input files: orders-api/
