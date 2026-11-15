# Elevated error rate

1. **Scope it.** Which journey or route? All pods or some? All regions or some? Since when? Compare with the
   same window yesterday if you can. A fraction that matches a fraction of pods (a third, a half) is a clue.
2. **Find where the error starts.** Open a failing trace from the user-facing service and walk down: the
   deepest span that failed is usually closer to the cause than the one that alerted. Note the error each
   span carries.
3. **Read that service's logs for the same minutes**, filtered to warnings and errors. Most of our logs carry
   a `trace_id`, so a failing trace's logs are one click away.
4. **Check its dependencies**: are they up, ready, and getting the requests you think they are? A dependency
   with no server span for a request its caller sent never saw that request.
5. **Line it up with changes** ([What changed?](what-changed.md)) and with Kubernetes events (restarts,
   probe failures, scheduling).

Error text you'll see from our HTTP clients:

| Error | Means |
| ----- | ----- |
| `fetch failed: ENOTFOUND` | DNS has no such name: a wrong hostname, or the Service doesn't exist |
| `fetch failed: ECONNREFUSED` | the address answered and nothing was listening: wrong port, or no ready endpoint |
| `fetch failed: ECONNRESET` / `socket hang up` | the connection was cut: the other side restarted or closed it |
| `timeout after Nms` | no answer in time: slow, overloaded, or packets dropped on the way |
| `http 4xx` / `http 5xx` | the other side answered with an error: read its logs |
