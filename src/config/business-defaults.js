export const defaultReferenceData = () => ({
  user_roles: ["admin", "staff"],
});

export const defaultAccessRules = () => [
  { key: "dashboard", label: "Dashboard", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "users_manage", label: "Users", roles: ["admin"], show_in_sidebar: true },
  { key: "customers", label: "Customers", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "suppliers", label: "Suppliers", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "purchases", label: "Purchases", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "inventory", label: "Inventory", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "invoices", label: "Invoices", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "sales_returns", label: "Sales Returns", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "purchase_returns", label: "Purchase Returns", roles: ["admin", "staff"], show_in_sidebar: true },
  { key: "settings", label: "Settings", roles: ["admin", "staff"], show_in_sidebar: false },
  { key: "options", label: "Options & Configuration", roles: ["admin"], show_in_sidebar: false },
  { key: "keyboard_shortcuts", label: "Keyboard Shortcuts", roles: ["admin", "staff"], show_in_sidebar: false },
];

export const defaultRuleData = () => ({
  access_rules: defaultAccessRules(),
});
