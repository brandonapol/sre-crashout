# web shedding load

`web` limits how many requests each pod works on at once (`MAX_IN_FLIGHT`). Past the limit it answers `503
server_busy` straight away, without calling anything, and counts it in `http.server.requests_shed`. That
protects the pod, but every shed request is a user error, on any page.

How many requests a pod holds at once is its request rate times how long each takes. So shedding starts when
traffic rises, or when requests get slower.

1. Is traffic higher than usual? Compare `browser-sim`'s request rate with last week.
2. Are `web`'s requests slower than usual? Look at the latency of the requests it does serve, and which spans
   inside them got slower.
3. Scaling `web` (more replicas) raises the total limit. It's a mitigation; if requests got slower, find
   out why.
