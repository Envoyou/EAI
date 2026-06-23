# Zoho Desk Integration

EAI uses Zoho Desk as a read-only support ticket source for manual credit
adjustments. Zoho Desk remains the system of record for support workflows.

## Required scope

Create a Self Client or server-based OAuth client in the Zoho API Console with:

```text
Desk.tickets.READ
Desk.tickets.CREATE
Desk.basic.READ
Desk.search.READ
```

`Desk.search.READ` is required because billing admins normally enter the
human-facing ticket number. Zoho resolves that number through its ticket search
endpoint. `Desk.tickets.READ` alone is sufficient only when EAI already has the
internal Zoho ticket ID.

## Refresh token

The value stored in `ZOHO_DESK_REFRESH_TOKEN` must be the permanent refresh
token returned by Zoho's OAuth token exchange. Do not store the short-lived
authorization grant code in this variable.

If Zoho returns `invalid_code`, generate a new grant code in the API Console and
exchange it immediately using the accounts domain for the EAI Zoho data center.
The token response contains both `access_token` and `refresh_token`; store only
the `refresh_token` in the EAI environment.

## Environment

```env
ZOHO_DESK_ENABLED="true"
ZOHO_DESK_CLIENT_ID=""
ZOHO_DESK_CLIENT_SECRET=""
ZOHO_DESK_REFRESH_TOKEN=""
ZOHO_DESK_ORG_ID=""
ZOHO_DESK_DEPARTMENT_ID=""
ZOHO_ACCOUNTS_URL="https://accounts.zoho.com"
ZOHO_DESK_API_URL="https://desk.zoho.com/api/v1"
```

Use matching data-center domains for both Accounts and Desk. Keep all values
server-side in local `.env` or Vercel environment variables.
`ZOHO_DESK_DEPARTMENT_ID` may be omitted while the account has exactly one
active department; EAI resolves and caches that department automatically.

## Runtime behavior

1. An owner or super-admin enters a Zoho ticket number or ticket ID.
2. EAI refreshes an OAuth access token server-side.
3. EAI fetches the ticket read-only and displays its subject, customer, and status.
4. The billing API verifies the ticket again immediately before the ledger write.
5. The ledger stores the Zoho ticket number, immutable ticket ID, and ticket URL.

## Public support form

`/support` creates a ticket directly in Zoho Desk without exposing OAuth
credentials to the browser. The public endpoint validates request size and
fields, applies a basic rate limit, and includes a honeypot field for bots.
