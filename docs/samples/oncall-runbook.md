# On-Call Runbook

How the Lumen Labs platform team (fictional sample data for DocMind) handles production incidents.

## Rotation

On-call runs in weekly shifts that hand over every Monday at 11:00 IST. Each shift has a primary and a secondary engineer. The primary must acknowledge a page within 5 minutes; if they don't, PagerDuty escalates to the secondary after 10 minutes and to the engineering manager after 20 minutes.

On-call engineers receive a stipend of ₹4,000 per week, plus one compensatory day off for every night they were paged between 00:00 and 06:00.

## Severity Levels

SEV1: the product is down or data is at risk for all customers. Start an incident channel immediately, page the incident commander, and post a status-page update within 15 minutes.

SEV2: a major feature is broken or degraded for many customers. Open an incident channel and post updates every 30 minutes.

SEV3: a minor bug or a single customer is affected. Create a ticket; no incident channel is required.

## Error ERR-4021: Payment Webhook Timeout

ERR-4021 means the payment provider's webhook did not reach the orders service within 30 seconds. First check the webhook dashboard for a provider-side outage. If the provider is healthy, restart the webhook-consumer deployment with `kubectl rollout restart deploy/webhook-consumer -n payments`. Missed webhooks are replayed automatically by the reconciliation job every 15 minutes, so do not replay them manually.

## Error ERR-5310: Database Connection Pool Exhausted

ERR-5310 means the API cannot get a database connection. Check for long-running queries with `SELECT * FROM pg_stat_activity WHERE state = 'active' ORDER BY query_start`. Kill queries running longer than 5 minutes only after confirming they are not migrations. If the pool is exhausted because of traffic, scale the API deployment to 6 replicas.

## Postmortems

Every SEV1 and SEV2 needs a blameless postmortem within 5 working days. Postmortems list a timeline, the root cause, what went well, and action items with owners and due dates.
