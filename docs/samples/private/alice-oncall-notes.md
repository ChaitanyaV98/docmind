# Alice's On-Call Notes

Private notes — only Alice should ever see these (fictional sample data for DocMind).

## Handover for the week of 3 November

The flaky test in the checkout suite is caused by a race in the cart cache warm-up. I've muted it with ticket PLAT-812; please don't unmute until the fix in PR 2291 is merged.

The staging database was resized to 4 vCPUs on Thursday. If ERR-5310 shows up on staging, it is almost certainly the nightly analytics export, not real traffic — pause the export job instead of scaling the API.

## Personal reminders

Ask the manager about the Kubernetes certification budget before the 20th, so it can be claimed from this year's learning budget.
