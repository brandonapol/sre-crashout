# Changelog

## 2.8.3

- pricing: starts with the catalogue's prices loaded from a snapshot, and spreads cache expiry so prices don't
  all refresh at once.
- pricing: rate engine pool and queue limits are configurable.
- web: sheds load past `MAX_IN_FLIGHT` instead of queueing.

## 2.8.2

- quotes: line items with quantity 0 are rejected.
