# TexTradeOS PRO Backend Architecture (Commerce v2)

## Added modules
- `src/db/schema-v2.js`: idempotent schema upgrade for returns, payments and inventory movements.
- `src/modules/returns`: sales/purchase return business rules + HTTP routes.
- `src/modules/payments`: invoice payment business rules + HTTP routes.

## New API
- `GET /api/returns/sales`
- `POST /api/returns/sales`
- `GET /api/returns/sales/returnable/:customerId`
- `GET /api/returns/purchase`
- `POST /api/returns/purchase`
- `GET /api/returns/:type/:id`
- `DELETE /api/returns/:type/:id`
- `GET /api/payments/invoices/:invoiceId`
- `POST /api/payments/invoices/:invoiceId`

## Invoice extensions
`POST /api/invoices` now accepts nullable `customer_id`, `customer_kind` (`registered` or `walk_in`), `walk_in_person`, nested `sales_return`, and nested `payment`. Walk-in invoices do not require a saved customer ID. Nested return/payment writes happen in the same SQLite transaction as invoice creation.

## Return model
Sales and purchase returns are first-class documents with item rows. `return_stock` creates inventory movements. Purchase `keep_goods` allowance does not remove physical stock. Adjustment types: none, per_piece, percent, round, keep_per_piece, keep_percent, keep_amount.

## Compatibility/update safety
Schema upgrade is additive and idempotent; existing invoice fields and update/launcher infrastructure remain intact. Existing SQLite databases are upgraded at startup without deleting old data.
