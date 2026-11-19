# MrSa WhatsApp Blaster

A consent-first WhatsApp campaign management platform by **MrSa Solutions**.

## Current milestone — v0.1.0

The first frontend milestone includes:
- Responsive dashboard shell and module navigation
- Contact manager with add-contact flow
- Duplicate phone-number detection
- Search, group and consent filters
- CSV import with basic header mapping
- CSV export of the current filtered view
- Contact groups and opt-in / pending / opt-out states
- Browser-local persistence for demo contacts

**Prototype limitation:** contacts are currently stored in the browser only. Authentication, shared database storage, backend APIs, campaign sending, delivery tracking, and WhatsApp Cloud API integration are not implemented yet.

## Run locally

Requirements: Node.js 18.18+ or 20+.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

## CSV format

The importer requires a header row with `Name` and `Phone`. Optional columns: `Group` and `Consent`.

Example:

```csv
Name,Phone,Group,Consent
Arun Kumar,+919876543210,Customers,Opted in
Priya S,+919876543211,Leads,Pending
```

## Compliance and security

- Importing a phone number does not establish WhatsApp opt-in.
- Only message people who have provided valid permission for the intended message category.
- Respect opt-outs and maintain a suppression list in the production backend.
- Use approved WhatsApp message templates when required by Meta policy.
- Integrate only through the official WhatsApp Business Platform / Cloud API.
- Keep access tokens, app secrets, and webhook secrets on the server. Never expose them in frontend variables or commit them to Git.
- Add authentication, role-based access, rate limits, audit logs, and webhook verification before production use.

## Planned milestones

1. Dashboard and contact management — current frontend prototype
2. Backend API, authentication, database, and durable consent records
3. Campaign builder, approved template management, scheduling, and queue
4. Official WhatsApp Cloud API integration and webhook status processing
5. Analytics, exports, audit logs, and production hardening

## Structure

```text
src/
  App.jsx
  main.jsx
  styles.css
index.html
package.json
.env.example
```

## License

Proprietary project for MrSa Solutions. Add a formal license before external distribution.
