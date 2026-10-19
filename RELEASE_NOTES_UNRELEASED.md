# Unreleased

## Added

- Added developer-owned Business Profile management with a default developer account (`dev` / `dev@SparkPair`) while preserving the existing admin account.
- Added branded Customer 2 invoice support for A4/A5 and Thermal 80mm previews and printing.
- Added configurable business logo, Urdu business name, invoice tagline, primary color, banner, and watermark settings.
- Added a Customized Invoice switch; it defaults to off and selects the default Customer 1 invoice when disabled.
- Added PNG/SVG logo validation, size limits, and SVG safety checks.
- Added SparkPair footer credit and contact number to invoices.
- Added developer-configurable invoice summary fields, zero-value hiding, compact spacing, and single/dual summary boxes.

## Changed

- Refined Business Profile into the dashboard layout with responsive branding controls and animated invoice toggle.
- Standardized icon-bearing section-header horizontal spacing across the application.
- Removed the manual Preview Customer selector; invoice preview and printing now follow the saved Customized Invoice setting.
- Summary preferences now apply consistently to A4/A5 and Thermal 80mm invoice previews and prints.

## Verification

- Frontend production build passes.
- Backend test suite passes.
