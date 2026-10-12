import crypto from "node:crypto";
import { db } from "../src/db/connection.js";
import { defaultReferenceData, defaultRuleData } from "../src/config/business-defaults.js";

const BUSINESS_ID = 1;
const ADMIN_ID = 2;
const now = "2026-10-12T10:00:00.000Z";
const stamp = (date) => `${date}T10:00:00.000Z`;
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const round = (value) => Math.round(value * 100) / 100;

const suppliers = [
  { id: "supplier-karachi-textiles", name: "Karachi Textiles & Garments", person: "Imran Siddiqui", urdu: "کراچی ٹیکسٹائلز", phone: "0300-1234567", address: "Jodia Bazaar", city: "Karachi" },
  { id: "supplier-lahore-kids", name: "Lahore Kids Collection", person: "Usman Malik", urdu: "لاہور کڈز کلیکشن", phone: "0321-7654321", address: "Shah Alam Market", city: "Lahore" },
  { id: "supplier-faisalabad-knit", name: "Faisalabad Knitwear House", person: "Adeel Rauf", urdu: "فیصل آباد نٹ وئیر", phone: "0345-5558899", address: "Rail Bazaar", city: "Faisalabad" },
];

const customers = [
  { id: "customer-al-madina", name: "Al Madina Garments", person: "Ahmed Raza", urdu: "المدینہ گارمنٹس", phone: "0301-1112233", address: "Main Bazaar", city: "Rawalpindi" },
  { id: "customer-bismillah", name: "Bismillah Kids Wear", person: "Bilal Khan", urdu: "بسم اللہ کڈز وئیر", phone: "0333-4445566", address: "Railway Road", city: "Gujranwala" },
  { id: "customer-city-fashion", name: "City Fashion House", person: "Saad Ali", urdu: "سٹی فیشن ہاؤس", phone: "0322-7788990", address: "Saddar", city: "Peshawar" },
  { id: "customer-noor-traders", name: "Noor Traders", person: "Kamran Shah", urdu: "نور ٹریڈرز", phone: "0315-2200440", address: "Bohar Bazaar", city: "Multan" },
];

const articles = [
  { no: "ART-0001", description: "Boys Cotton Polo T-Shirt", size: "S-M-L", season: "Summer", category: "Boys", unit: 6, pcs: 120, rate: 420, sale: 575, supplier: "supplier-karachi-textiles", purchase: "P-2026-0001" },
  { no: "ART-0002", description: "Girls Printed Frock", size: "24-32", season: "Summer", category: "Girls", unit: 4, pcs: 60, rate: 680, sale: 850, supplier: "supplier-karachi-textiles", purchase: "P-2026-0001", discount: "5%" },
  { no: "ART-0003", description: "Kids Denim Jeans", size: "20-30", season: "All Season", category: "Kids", unit: 6, pcs: 60, rate: 750, sale: 950, supplier: "supplier-karachi-textiles", purchase: "P-2026-0001" },
  { no: "ART-0004", description: "Baby Winter Suit", size: "0-3 Years", season: "Winter", category: "Baby", unit: 3, pcs: 72, rate: 900, sale: 1150, supplier: "supplier-lahore-kids", purchase: "P-2026-0002" },
  { no: "ART-0005", description: "Girls Cotton Leggings Pack", size: "22-30", season: "All Season", category: "Girls", unit: 6, pcs: 48, rate: 310, sale: 450, supplier: "supplier-lahore-kids", purchase: "P-2026-0002" },
  { no: "ART-0006", description: "Men Cotton Shalwar Kameez", size: "M-L-XL", season: "Winter", category: "Men", unit: 4, pcs: 96, rate: 1250, sale: 1550, supplier: "supplier-faisalabad-knit", purchase: "P-2026-0003" },
  { no: "ART-0007", description: "Ladies Lawn 3-Piece Suit", size: "Free Size", season: "Summer", category: "Ladies", unit: 4, pcs: 48, rate: 1450, sale: 1850, supplier: "supplier-faisalabad-knit", purchase: "P-2026-0003" },
];

const sales = [
  { no: "2026-0001", date: "2026-09-02", customer: "customer-al-madina", lines: [["ART-0001", 24], ["ART-0002", 12]], discount: 500, received: 10000, method: "cash" },
  { no: "2026-0002", date: "2026-09-08", customer: "customer-bismillah", lines: [["ART-0003", 24], ["ART-0004", 12]], discount: 0, received: 12000, method: "online" },
  { no: "2026-0003", date: "2026-09-15", customer: "customer-city-fashion", lines: [["ART-0005", 24], ["ART-0006", 24]], discount: 750, received: 30000, method: "cheque" },
  { no: "2026-0004", date: "2026-09-21", customer: "customer-noor-traders", lines: [["ART-0001", 24], ["ART-0007", 12]], discount: 600, received: 15000, method: "cash" },
  { no: "2026-0005", date: "2026-09-28", customer: "customer-al-madina", lines: [["ART-0004", 24], ["ART-0006", 12]], discount: 0, received: 15000, method: "cash" },
  { no: "2026-10-05", date: "2026-10-05", customer: "customer-bismillah", lines: [["ART-0002", 12], ["ART-0003", 12]], discount: 300, received: 10000, method: "slip" },
];

const getCustomer = (customerId) => customers.find((row) => row.id === customerId);
const getArticle = (articleNo) => articles.find((row) => row.no === articleNo);

function clearBusinessData() {
  // Delete children explicitly so this remains safe even if a legacy schema has missing cascades.
  [
    "invoice_payments", "party_payments", "returns", "invoices",
    "inventory_movements", "purchases", "expenses",
    "commerce_counters", "shared_collections", "customers", "suppliers",
  ].forEach((table) => db.prepare(`DELETE FROM ${table} WHERE business_id = ?`).run(BUSINESS_ID));
  db.prepare("DELETE FROM article_qr_codes").run();
  // purchase_items, invoice_items and return_items are keyed through parent rows only.
  db.prepare("DELETE FROM purchase_items WHERE purchase_id NOT IN (SELECT id FROM purchases)").run();
  db.prepare("DELETE FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices)").run();
  db.prepare("DELETE FROM return_items WHERE return_id NOT IN (SELECT id FROM returns)").run();
  db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE business_id = ?)").run(BUSINESS_ID);
}

function insertParties() {
  const supplier = db.prepare("INSERT INTO suppliers (id,business_id,supplier_name,person_name,urdu_title,phone_number,address,city,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  suppliers.forEach((row) => supplier.run(row.id, BUSINESS_ID, row.name, row.person, row.urdu, row.phone, row.address, row.city, 1, now, now));
  const customer = db.prepare("INSERT INTO customers (id,business_id,customer_name,person_name,urdu_title,phone_number,address,city,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  customers.forEach((row) => customer.run(row.id, BUSINESS_ID, row.name, row.person, row.urdu, row.phone, row.address, row.city, 1, now, now));
}

function insertPurchases() {
  const purchaseRows = new Map();
  articles.forEach((article) => {
    if (!purchaseRows.has(article.purchase)) purchaseRows.set(article.purchase, { supplier: article.supplier, date: article.purchase === "P-2026-0001" ? "2026-08-18" : article.purchase === "P-2026-0002" ? "2026-08-22" : "2026-08-26", items: [] });
    purchaseRows.get(article.purchase).items.push(article);
  });
  const purchase = db.prepare("INSERT INTO purchases (id,business_id,created_by,purchase_number,purchase_date,supplier_id,supplier_name,notes,total_amount,article_count,packet_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const item = db.prepare("INSERT INTO purchase_items (purchase_id,position,article_no,qr_id,description,size,season,category,unit,quantity_dzn,quantity_pcs,quantity_pkt,rate,sale_rate,discount,discount_amount,amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const qr = db.prepare("INSERT INTO article_qr_codes (qr_id,article_no,purchase_number,code,created_at) VALUES (?,?,?,?,?)");
  for (const [purchaseNumber, data] of purchaseRows) {
    const purchaseId = id("purchase");
    const supplier = suppliers.find((row) => row.id === data.supplier);
    const total = data.items.reduce((sum, row) => sum + row.pcs * row.rate, 0);
    const packets = data.items.reduce((sum, row) => sum + row.pcs / row.unit, 0);
    purchase.run(purchaseId, BUSINESS_ID, ADMIN_ID, purchaseNumber, data.date, supplier.id, supplier.name, "Demo opening stock", total, data.items.length, packets, stamp(data.date), stamp(data.date));
    data.items.forEach((row, index) => {
      const qrId = id("qr");
      item.run(purchaseId, index, row.no, qrId, row.description, row.size, row.season, row.category, row.unit, row.pcs / 12, row.pcs, row.pcs / row.unit, row.rate, row.sale, row.discount || "", 0, row.pcs * row.rate);
      qr.run(qrId, row.no, purchaseNumber, `T1.${row.no}.${purchaseNumber}`, stamp(data.date));
    });
  }
}

function insertInvoices() {
  const invoice = db.prepare("INSERT INTO invoices (business_id,created_by,invoice_number,invoice_date,customer_name,customer_urdu_title,salesman_name,customer_phone,customer_address,gross_amount,percent_discount_amount,rupee_discount_amount,total_discount_amount,net_amount,sales_return_amount,received_amount,balance_amount,return_amount,total_amount,created_at,updated_at,customer_id,customer_kind,walk_in_person,payment_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const item = db.prepare("INSERT INTO invoice_items (invoice_id,position,size,description,dzn,pcs,rate,gross_amount,discount,discount_type,discount_amount,amount,article_no,purchase_number,unit,quantity_pkt,purchase_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const payment = db.prepare("INSERT INTO invoice_payments (business_id,invoice_id,created_by,payment_date,method,amount,reference_no,account_name,bank_name,cheque_no,cheque_date,slip_no,transaction_id,notes,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  sales.forEach((sale) => {
    const customer = getCustomer(sale.customer);
    const lines = sale.lines.map(([articleNo, pcs]) => ({ article: getArticle(articleNo), pcs }));
    const gross = lines.reduce((sum, row) => sum + row.pcs * row.article.sale, 0);
    const net = Math.max(0, gross - sale.discount);
    const balance = Math.max(0, net - sale.received);
    const invoiceResult = invoice.run(BUSINESS_ID, ADMIN_ID, sale.no, sale.date, customer.name, customer.urdu, "Wholesale Counter", customer.phone, customer.address, gross, 0, sale.discount, sale.discount, net, 0, sale.received, balance, Math.max(0, sale.received - net), net, stamp(sale.date), stamp(sale.date), customer.id, "registered", "", sale.received >= net ? "paid" : sale.received > 0 ? "partial" : "unpaid");
    const invoiceId = Number(invoiceResult.lastInsertRowid);
    lines.forEach((line, index) => {
      const amount = line.pcs * line.article.sale;
      item.run(invoiceId, index + 1, line.article.size, line.article.description, line.pcs / 12, line.pcs, line.article.sale, amount, "", "", 0, amount, line.article.no, line.article.purchase, line.article.unit, line.pcs / line.article.unit, line.article.rate);
    });
    payment.run(BUSINESS_ID, invoiceId, ADMIN_ID, sale.date, sale.method, sale.received, `RCPT-${sale.no}`, sale.method === "cheque" ? "Meezan Bank" : "", sale.method === "cheque" ? "CHQ-7788" : "", sale.method === "cheque" ? sale.date : "", sale.method === "slip" ? `SLIP-${sale.no}` : "", "", "", "Demo customer receipt", "{}", stamp(sale.date), stamp(sale.date));
  });
}

function insertReturnsAndExpenses() {
  const salesReturn = db.prepare("INSERT INTO returns (business_id,created_by,return_number,return_type,return_date,party_id,party_name,linked_invoice_id,linked_purchase_id,stock_action,adjustment_type,adjustment_value,adjustment_input,gross_amount,adjustment_amount,total_amount,total_pcs,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const returnItem = db.prepare("INSERT INTO return_items (return_id,position,article_no,purchase_number,qr_id,source_document_id,description,pcs,rate,gross_amount,amount,discount,discount_type,discount_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const salesInvoice = db.prepare("SELECT id FROM invoices WHERE business_id = ? AND invoice_number = ?").get(BUSINESS_ID, "2026-0002");
  const salesReturnId = Number(salesReturn.run(BUSINESS_ID, ADMIN_ID, "SR-2026-0001", "sales", "2026-09-10", "customer-bismillah", "Bismillah Kids Wear", salesInvoice.id, null, "return_stock", "none", 0, "", 5700, 0, 5700, 6, "Size exchange / returned pieces", stamp("2026-09-10"), stamp("2026-09-10")).lastInsertRowid);
  returnItem.run(salesReturnId, 1, "ART-0003", "P-2026-0001", "", "2026-0002", "Kids Denim Jeans", 6, 950, 5700, 5700, "", "", 0);
  db.prepare("UPDATE invoices SET sales_return_amount = ?, total_amount = ?, balance_amount = ?, return_amount = ?, updated_at = ? WHERE id = ?")
    .run(5700, 30900, 18900, 0, stamp("2026-09-10"), salesInvoice.id);
  const purchaseReturnId = Number(salesReturn.run(BUSINESS_ID, ADMIN_ID, "PR-2026-0001", "purchase", "2026-09-12", "supplier-lahore-kids", "Lahore Kids Collection", null, "purchase-P-2026-0002", "return_stock", "none", 0, "", 1860, 0, 1860, 6, "Defective leggings returned to supplier", stamp("2026-09-12"), stamp("2026-09-12")).lastInsertRowid);
  returnItem.run(purchaseReturnId, 1, "ART-0005", "P-2026-0002", "", "P-2026-0002", "Girls Cotton Leggings Pack", 6, 310, 1860, 1860, "", "", 0);
  const expense = db.prepare("INSERT INTO expenses (business_id,created_by,expense_date,category,paid_to,method,amount,reference_no,bank_name,cheque_date,slip_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  [
    ["2026-09-03", "Shop Rent", "Property Management", "online", 45000, "BANK-SEP-001", "Monthly wholesale shop rent"],
    ["2026-09-11", "Transport", "City Cargo Services", "cash", 6500, "", "Delivery and loading charges"],
    ["2026-09-18", "Utilities", "K-Electric", "slip", 8200, "SLIP-SEP-018", "Electricity bill"],
    ["2026-10-02", "Packing Material", "Pak Pack Suppliers", "cash", 3750, "", "Cartons, bags and labels"],
  ].forEach(([date, category, paidTo, method, amount, reference, notes]) => expense.run(BUSINESS_ID, ADMIN_ID, date, category, paidTo, method, amount, reference, method === "slip" ? "Meezan Bank" : "", "", method === "slip" ? date : "", notes, stamp(date), stamp(date)));
}

const run = db.transaction(() => {
  clearBusinessData();
  db.prepare("UPDATE businesses SET name = ?, person = ?, registration_date = ?, reference_data = ?, rule_data = ?, invoice_counter_year = ?, invoice_counter_last = ?, updated_at = ? WHERE id = ?")
    .run("TexTrade Garments Wholesale", "Muhammad Hasan", now, JSON.stringify(defaultReferenceData()), JSON.stringify(defaultRuleData()), 2026, 6, now, BUSINESS_ID);
  insertParties();
  insertPurchases();
  insertInvoices();
  insertReturnsAndExpenses();
});

run.immediate();
console.log("Garments wholesale demo data seeded successfully for business", BUSINESS_ID);
