# First five minutes

1. **Acknowledge** the page, so nobody else starts the same work.
2. **Open an incident channel** (or thread) and post: what fired, what you're looking at first, and when you'll
   next update. Name an incident lead if more than one person is on it; by default, that's you.
3. **Establish impact.** Who is affected and how badly? Look at the user-facing journey, not only the service
   that alerted: the synthetic traffic's spans (`partner-sim`, `shopper-sim`, `browser-sim`) are what users
   experience. Is it every request, a fraction, one route, one region, one pod?
4. **Ask what changed** ([What changed?](what-changed.md)). Most incidents follow a change. A change made
   minutes or hours ago still counts.
5. **Mitigate before you diagnose**, if a safe lever exists ([Rolling back](mitigation.md)). If a deploy
   lines up with the start, rolling it back is usually cheaper than understanding it first.
6. **Write down what you've ruled out** as you go, with the evidence. It saves the next person 20 minutes,
   and it's the backbone of the postmortem.

Things that cost time:

- Fixing the first suspicious thing you see. Loud logs aren't always the cause; check that a suspect lines up
  in time and in scope with the impact.
- Debugging one pod in isolation when the problem is the system. Compare a healthy pod with a broken one.
- Going quiet. Post an update even when it's "still looking, nothing new".
