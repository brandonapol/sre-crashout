# Elevated latency

1. **Which percentile, which journey?** A p99 rise with a flat p50 means some requests are slow. A whole
   shift means everything is. Group by pod and by `service.version`: is the slowness everywhere, or in one
   place?
2. **Find where the time goes.** Open slow traces and look for the widest span. Gaps between spans are time
   spent in the process itself: waiting for the CPU, the event loop, a lock, a pool.
3. **Check saturation**, per pod, against what it's allowed:
   - CPU usage against the container's **limit**, not just its request. A container sitting flat at its
     limit is being throttled, and nothing in its logs will say so.
   - Event loop delay (`nodejs.eventloop.delay.*`), and GC time.
   - Pools and queues the service reports (connections in use, requests waiting).
4. **Look for amplification.** Timeouts lead to retries, and retries are more load. Compare the request rate
   at each hop with what users send.
5. **Line it up with changes** ([What changed?](what-changed.md)): resource limits, replica counts, sizes of
   work per request, new dependencies.

Slow-but-successful is the hardest kind of incident to see, because error-based alerts stay green. Check
whether users are timing out on their side (the synthetic traffic's errors) even when the services report
none.
