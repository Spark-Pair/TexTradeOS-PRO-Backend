# TexTradeOS PRO Backend Architecture

## Direction

The backend uses a layered Express + SQLite architecture. We intentionally do not use a repository layer or ORM. SQLite access belongs in table/domain-specific model files.

```text
src/
├── server.js
├── app.js
├── config/
├── routes/
├── controllers/
├── services/
├── middleware/
├── models/
├── db/
└── utils/
```

### Responsibilities

- **routes/**: URL and HTTP method definitions only.
- **controllers/**: HTTP request/response handling and status codes.
- **services/**: business rules, workflows and orchestration.
- **middleware/**: authentication, authorization, licensing and cross-cutting request checks.
- **models/**: SQLite queries and persistence operations grouped by domain/table.
- **db/**: database initialization, schema upgrades/migrations and seed/reference data.
- **config/**: application configuration.
- **server.js**: process bootstrap only once migration is complete.
- **app.js**: Express application composition and route registration once migration is complete.

The intended request flow is:

```text
Request -> Route -> Middleware -> Controller -> Service -> Model -> SQLite
```

## Migration policy

This is a behavior-preserving refactor. Existing API paths, response contracts, authentication/license behavior, update/launcher behavior and SQLite data compatibility must not change while code is moved into layers. New code should follow the layered structure rather than adding more route/controller/database logic to `server.js`.

The authentication domain has been split into `routes/auth.routes.js`, `controllers/auth.controller.js`, `services/auth.service.js`, `models/user.model.js` and `models/session.model.js`. Compatibility middleware entry points live under `middleware/` while the legacy implementations are migrated safely.

## Commerce v2

The existing returns and payments features remain compatible during the migration. The additive `src/db/schema-v2.js` upgrade continues to provide returns, payments and inventory-movement schema support without deleting existing data.

Existing API includes:

- `GET /api/returns/sales`
- `POST /api/returns/sales`
- `GET /api/returns/sales/returnable/:customerId`
- `GET /api/returns/purchase`
- `POST /api/returns/purchase`
- `GET /api/returns/:type/:id`
- `DELETE /api/returns/:type/:id`
- `GET /api/payments/invoices/:invoiceId`
- `POST /api/payments/invoices/:invoiceId`

`POST /api/invoices` supports nullable `customer_id`, `customer_kind` (`registered` or `walk_in`), `walk_in_person`, nested `sales_return`, and nested `payment`. Nested return/payment writes remain in the same SQLite transaction as invoice creation.
