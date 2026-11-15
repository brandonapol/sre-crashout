# Calibration: why drills don't fire, or fire too hard

Every one of these happened while building sre-crashout's drills. Check the ones that apply before your first
injection.

## The fault doesn't reach any traffic

- **Keep-alive pinning.** Clients hold long-lived connections to the pods that existed when they connected. A
  new pod (a canary, a fresh ReplicaSet) gets no traffic until connections recycle, and kube-proxy balances
  per connection, not per request. Make the server close connections after N requests (Node's
  `server.maxRequestsPerSocket`, Envoy's `max_requests_per_connection`) or restart the client. Symptom: the
  new pod is in the Service's endpoints and its request rate is zero.
- **Rolling updates hide crash loops.** With `maxUnavailable: 0` the old pods keep serving while the new ones
  crash or stay Pending. That's the point of a basic drill; it's a surprise if you expected user impact.
- **The CNI ignores NetworkPolicy.** Many clusters accept NetworkPolicy objects and enforce nothing (kind on
  some kernels, some managed CNIs without a policy agent). `scripts/guard.bash netpol <ns>` tells you. k3s
  enforces by default. Under Istio ambient, inbound traffic arrives through ztunnel and a pod-level policy may
  not apply.
- **The app doesn't read what you changed.** Environment variables are read at startup; a ConfigMap change
  without a pod restart does nothing (unless that's the drill). Check the running pod's environment, not the
  manifest.

## The fault fires sometimes

- **Metastable collapse.** A degradation that only becomes an outage when a burst tips it (for example
  retries on top of a slow dependency at 60–70% utilization) collapses after 30 seconds one time and never the
  next. Push the trigger well past the tipping point (80–90% or more) so it collapses every time, and measure
  at least two runs.
- **Cold starts.** A cache that starts empty can collapse the baseline by itself on every reset, or make the
  baseline look different after each deploy. Warm caches at startup and spread their expiry (jitter) so the
  baseline is the same every time.
- **Small numbers.** Thresholds like "error ratio over 10%" on a fault that produces 11% fail half the time.
  Aim for the symptom to be two to three times past the threshold you verify.

## The fault fires too hard, or differently

- **Overload with no cancellation runs away.** If the server keeps working on requests the client has given up
  on, any demand above capacity grows a backlog without bound: a "latency" drill becomes a full outage within
  minutes. Either accept that and describe the progression, or keep demand below capacity and use a fault that
  only adds tail latency.
- **Probes compound the fault.** A busy or throttled process misses its liveness probe and gets restarted,
  adding restarts (and a misleading clue) to a drill that wasn't about restarts. Decide whether that's part of
  the drill and write the guide accordingly.
- **Effects that depend on the hardware.** CPU-heavy faults behave differently on a laptop and a big node. Make
  the work per request fixed in CPU time where you control the code, and size the limit with a wide margin.
- **Retries in the mesh.** Istio and other meshes retry some failures by default, which amplifies retry-storm
  drills and can hide connection-level errors. Say in the guide whether a mesh was present.

## Noise that isn't the fault

- **Rollouts drop requests.** Without graceful shutdown (keep serving for a few seconds after SIGTERM, close
  keep-alive connections), every deploy causes a burst of errors that looks like an incident, or hides one.
  Check the baseline survives a rollout cleanly before injecting anything.
- **Verify windows include the past.** If the synthetic users report the last 60 seconds, a check right after
  a deploy averages before and after. Wait a full window after the symptom starts, and after a reset.
- **Your own tooling.** Building images or running other load on the same node while measuring changes the
  results. So does editing a script while another run is still reading it.

## A checklist before you call it done

- baseline clean for 10 minutes, and clean again after a rollout of the unchanged app
- incident shows within the time you'll promise the facilitator, in two consecutive runs
- verify condition is well past its threshold in both runs
- reset returns to a clean baseline in both runs
- the answer key's numbers are the ones you measured
