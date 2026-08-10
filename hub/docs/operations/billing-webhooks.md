# Billing and webhook recovery

The `provider_webhook_events` ledger makes Whop event handling retry-safe. A succeeded event must not be processed again.

## Triage

1. Open `/admin/pipeline-health` and inspect failed or stalled webhook counts.
2. Query the receipt by provider and provider event ID. Review status, attempt count, event type, and last error.
3. Confirm the provider shows a valid signature and delivery attempt.
4. Confirm the related entitlement, membership, or payout record before replaying.

## Replay

- Replay from the provider dashboard whenever possible so signature validation remains intact.
- Failed receipts may retry. Succeeded receipts are intentionally ignored.
- Never manually create a payout solely because a webhook failed. Reconcile the invoice, creator, amount, and existing payout first.
- After recovery, verify access in the member account and the creator/admin commerce views.
