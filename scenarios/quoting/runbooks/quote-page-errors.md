# Quote page errors

The quote page is `web` → `quotes` → `pricing`. `web` answers `502 quote_unavailable` when its call to `quotes`
fails, and logs why:

```text
{service_name="web"} |= "quote request failed"
```

## web can't reach quotes

Seen after a deploy that changed service addresses (QUOTE-INC-012). The log's `error` says
`fetch failed: ECONNREFUSED` (something answered, nothing listening on that port) or
`fetch failed: ENOTFOUND` (no such name).

1. Compare `web`'s `QUOTES_URL` with the `quotes` Service:

   ```sh
   kubectl -n quoting get deploy web -o jsonpath='{.spec.template.spec.containers[0].env}' | jq '.[] | select(.name == "QUOTES_URL")'
   kubectl -n quoting get svc quotes
   ```

   Every service in quoting listens on port 8080.
2. Fix the value in the release and redeploy, or roll back (`helm -n quoting rollback quoting <revision>`).

The featured page doesn't call `quotes`, so it stays up in this case.

## quotes answers with an error

`web` logs `http 502` from `quotes`. `quotes` logs `quote failed: could not price all lines` with the first
pricing error. Follow it into `pricing`: its logs, its error rate, and whether `pricing` received the
requests `quotes` says it sent.
