# TexTradeOS Backend

Express and SQLite API for the active TexTradeOS modules:

- JWT authentication and sessions
- Users and business users
- Access rules and reference roles
- Invoices and invoice line items
- Automatic yearly invoice numbering
- Keyboard shortcuts
- Business invoice settings
- Dashboard summary data

## Run

```bash
npm install
npm run dev
```

The API runs at `http://localhost:4000/api`.

Copy `.env.example` to `.env` to customize secrets, CORS, or the port.

## Seed Accounts

| Role | Username | Password |
| --- | --- | --- |
| Developer | `developer` | `developer123` |
| Admin | `admin` | `admin123` |
| Staff | `staff` | `staff123` |

The SQLite database is created automatically as `textradeos.sqlite`.
