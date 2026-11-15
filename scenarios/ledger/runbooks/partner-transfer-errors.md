# Partner transfer errors

Partners create transfers with `POST /v1/transfers`. The error rate that matters is what `partner-sim`
records, not what `ledger-api` reports: a request that never reaches `ledger-api` (connection refused, reset,
or timed out on the partner's side) only shows up there.

1. Split the errors by journey (`partner transfer`, `partner transfer retry`, `balance check`). Balance checks
   don't touch `fx-rates`; transfers whose settlement currency differs from their currency do.
2. Open failing traces from `partner-sim` and follow them into `ledger-api`. Note the status and error on each
   span, and whether `ledger-api` saw the request at all.
3. `ledger-api` logs an error for each failed transfer with the reason:

   ```text
   {service_name="ledger-api"} | detected_level="error"
   ```

4. If errors come in bursts, line them up with `ledger-api` restarts ([ledger-api restarting](ledger-api-restarting.md)).
5. Check [what changed](../../../runbooks/what-changed.md).

Partners retry failed transfers with the same `Idempotency-Key`. If `ledger-api` lost the key (a restart, or
the key expired), the retry is a new transfer. After any incident with transfer errors, tell the payments
operations team the time window so they can reconcile.
