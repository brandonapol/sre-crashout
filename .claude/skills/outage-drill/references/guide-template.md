# Answer key template

Copy this into `<answer key location>/<app>/<tier>.md` and fill every section. The facilitator reads it while
the team is debugging, so lead with what they need in the moment and keep each section short.

```markdown
# <App>, <tier>: <a short name for the fault, e.g. "the rotated secret">

**Tier:** <tier>. <Two sentences: what makes this drill this hard, and what it trains.>

## Deploy announcement

<When to post it (with the trigger, ten minutes before, a day before, or none) and the text, written like a
real deploy message with a plausible ticket.>

## The page

> **[P1/P2/P3] <AlertName>.** <What the alert or the user report says, from the user's point of view. Never
> name the cause.>

## What's broken

<The change, the mechanism, and why it produces the symptom. Include the numbers you measured.>

## Causal chain

    <change>
      -> <first effect>
      -> <...>
      -> <user-visible symptom>

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| <synthetic users' spans> | <...> |
| <traces / logs / metrics / Kubernetes events / helm history / the diff> | <...> |
| <a red herring> | **red herring**: <why it's harmless> |

## Hint ladder

1. "<a question that points at the right signal without naming it>"
2. "<...>"
3. "<the last hint is nearly the answer>"

## Mitigation and fix

- **Mitigate**: <fastest safe lever, exact commands>
- **Not a fix**: <the tempting wrong move, and why>
- **Fix**: <what would stop it happening again>

## Discussion questions

- <three or four questions for the debrief>

## Run it

    <exact commands to trigger, verify (with the condition), and reset>

## Verification log

| Run | Time to symptom | Measured | Reset clean |
| --- | --------------- | -------- | ----------- |
| 1 | <e.g. 45s> | <e.g. checkout errors 98%, browse 0%> | <yes> |
| 2 | ... | ... | ... |

<Anything not verified, and why.>
```
