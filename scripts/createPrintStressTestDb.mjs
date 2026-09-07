import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const outputPath = path.resolve(process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join(process.cwd(), "TexTradeOS_Print_Stress_Test.sqlite"));
const force = process.argv.includes("--force");

if (fs.existsSync(outputPath) && !force) {
  console.error(`Refusing to overwrite existing database: ${outputPath}`);
  console.error("Re-run with --force when you intentionally want to replace this demo DB.");
  process.exit(1);
}
for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${outputPath}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}

process.env.DATABASE_PATH = outputPath;
process.env.IS_DEVELOPMENT = "true";

const { db } = await import("../src/db/connection.js");
const { initializeDatabase } = await import("../src/db/bootstrap.js");
const { defaultReferenceData, defaultRuleData } = await import("../src/config/business-defaults.js");
const { InvoiceService } = await import("../src/services/invoice.service.js");
const { savePurchase } = await import("../src/modules/purchases/purchase.service.js");
const { addInvoicePayment } = await import("../src/modules/payments/payment.service.js");
const { createReturn } = await import("../src/modules/returns/return.service.js");
const { getPartyLedger } = await import("../src/modules/parties/party.model.js");

initializeDatabase();

const iso = (date) => `${date}T09:30:00.000Z`;
const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const id = (prefix, n) => `${prefix}-${String(n).padStart(3, "0")}`;
const user = () => db.prepare("SELECT * FROM users WHERE username = 'admin'").get();

const customers = [
  ["cust-primary", "Madinah Kids Wear Wholesale", "Haji Imran Siddiqui", "0300-2187741", "Karachi", "Shop 22, Al-Karam Market, Bolton Market"],
  ["cust-002", "Al Noor Garments House", "Bilal Ahmed", "0321-3048821", "Hyderabad", "Resham Bazaar"],
  ["cust-003", "Faisalabad Cloth Centre", "Usman Rauf", "0333-7124419", "Faisalabad", "Karkhana Bazar"],
  ["cust-004", "Sialkot Fancy Hosiery", "Mubashir Ali", "0302-6619002", "Sialkot", "Railway Road"],
  ["cust-005", "Quetta School Uniform Depot", "Naseer Khan", "0315-8891408", "Quetta", "Masjid Road"],
  ["cust-006", "Peshawar Readymade Store", "Irfan Shah", "0345-9144207", "Peshawar", "Qissa Khwani"],
  ["cust-007", "Lahore Anarkali Garments", "Zeeshan Malik", "0301-4987005", "Lahore", "New Anarkali"],
  ["cust-008", "Sukkur Textile Traders", "Rashid Memon", "0336-2701145", "Sukkur", "Clock Tower Market"],
];
const suppliers = [
  ["supp-primary", "Gul Ahmed Mill Store", "Raza Merchant", "021-32588710", "Karachi", "SITE Area"],
  ["supp-002", "Chenab Textile Agency", "Hammad Butt", "041-2607741", "Faisalabad", "D Ground"],
  ["supp-003", "Sapphire Knits Wholesale", "Salman Qureshi", "042-36322081", "Lahore", "Shah Alam"],
  ["supp-004", "Nishat Fabric Lots", "Adeel Rana", "042-35718220", "Lahore", "Kot Lakhpat"],
];
const sizes = ["S", "M", "L", "XL", "XXL", "20", "22", "24", "26", "28", "30", "32", "34", "36"];
const categories = ["Kids T-Shirt", "Boys Trouser", "Girls Frock", "School Uniform", "Winter Hoodie", "Cotton Night Suit", "Track Suit"];
const descriptors = ["Export leftover soft cotton", "Double stitched rib neck", "Printed front panel", "Wash-and-wear fabric", "Interlock premium lot", "Fleece brushed inside", "Packed color assortment"];

db.transaction(() => {
  db.prepare("DELETE FROM inventory_movements").run();
  db.prepare("DELETE FROM invoice_payments").run();
  db.prepare("DELETE FROM return_items").run();
  db.prepare("DELETE FROM returns").run();
  db.prepare("DELETE FROM invoice_items").run();
  db.prepare("DELETE FROM invoices").run();
  db.prepare("DELETE FROM purchase_items").run();
  db.prepare("DELETE FROM purchases").run();
  db.prepare("DELETE FROM customers").run();
  db.prepare("DELETE FROM suppliers").run();
  db.prepare("DELETE FROM commerce_counters").run();
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM users").run();
  db.prepare("DELETE FROM businesses").run();

  const now = iso("2026-09-07");
  const businessId = Number(db.prepare(`
    INSERT INTO businesses (name, person, price, registration_date, is_active, reference_data, rule_data, invoice_banner_data, machine_options, invoice_counter_year, invoice_counter_last, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 2026, 0, ?, ?)
  `).run(
    "Akhlaq Garments Wholesale", "Muhammad Akhlaq", 0, "2026-01-01",
    JSON.stringify(defaultReferenceData()), JSON.stringify(defaultRuleData()),
    "Wholesale garments, kids wear and hosiery", JSON.stringify(["thermal_printer", "barcode_scanner"]),
    now, now
  ).lastInsertRowid);
  db.prepare("INSERT INTO users (business_id, name, username, password_hash, role, is_active, shortcuts, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 1, '{}', ?, ?)")
    .run(businessId, "Admin", "admin", bcrypt.hashSync("admin123", 10), now, now);

  const insertCustomer = db.prepare("INSERT INTO customers (id,business_id,customer_name,person_name,phone_number,address,city,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  customers.forEach((c, i) => insertCustomer.run(c[0], businessId, c[1], c[2], c[3], c[5], c[4], 1, iso(`2026-01-${String(i + 2).padStart(2, "0")}`), now));
  const insertSupplier = db.prepare("INSERT INTO suppliers (id,business_id,supplier_name,person_name,phone_number,address,city,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  suppliers.forEach((s, i) => insertSupplier.run(s[0], businessId, s[1], s[2], s[3], s[5], s[4], 1, iso(`2026-01-${String(i + 2).padStart(2, "0")}`), now));
}).immediate();

const admin = user();
const allArticles = [];
for (let p = 0; p < 18; p += 1) {
  const supplier = suppliers[p % suppliers.length];
  const purchaseDate = `2026-${String(1 + Math.floor(p / 3)).padStart(2, "0")}-${String(5 + (p % 20)).padStart(2, "0")}`;
  const articles = Array.from({ length: 12 }, (_, i) => {
    const seq = p * 12 + i + 1;
    const rate = 360 + (seq % 9) * 35;
    const sale = rate + 120 + (seq % 5) * 25;
    const pcs = 160 + (seq % 7) * 24;
    const article = {
      article_no: `AG-${String(2600 + seq)}`,
      qr_id: `QR-${String(2600 + seq)}`,
      description: `${descriptors[seq % descriptors.length]} ${categories[seq % categories.length]}`,
      size: sizes[seq % sizes.length],
      season: seq % 3 === 0 ? "Winter 2026" : "Summer 2026",
      category: categories[seq % categories.length],
      unit: 12,
      quantity_dzn: round(pcs / 12),
      quantity_pcs: pcs,
      quantity_pkt: round(pcs / 12),
      rate,
      sale_rate: sale,
      discount: seq % 6 === 0 ? "10" : "",
      discount_amount: seq % 6 === 0 ? pcs * 10 : 0,
      amount: pcs * rate - (seq % 6 === 0 ? pcs * 10 : 0),
    };
    allArticles.push(article);
    return article;
  });
  await savePurchase(admin.business_id, admin.id, { purchase_date: purchaseDate, supplier_id: supplier[0], notes: `Seasonal lot ${p + 1} with mixed garments and size ratio packs`, articles });
}

for (let p = 0; p < 32; p += 1) {
  const purchaseDate = `2026-${String(2 + Math.floor(p / 6)).padStart(2, "0")}-${String(2 + (p % 25)).padStart(2, "0")}`;
  const articles = Array.from({ length: 3 }, (_, i) => {
    const seq = 500 + p * 3 + i + 1;
    const rate = 420 + (seq % 8) * 30;
    const pcs = 72 + (seq % 6) * 12;
    const article = {
      article_no: `AG-${String(2600 + seq)}`,
      qr_id: `QR-${String(2600 + seq)}`,
      description: `${descriptors[seq % descriptors.length]} ${categories[seq % categories.length]}`,
      size: sizes[seq % sizes.length],
      season: seq % 2 === 0 ? "Summer 2026" : "Winter 2026",
      category: categories[seq % categories.length],
      unit: 12,
      quantity_dzn: round(pcs / 12),
      quantity_pcs: pcs,
      quantity_pkt: round(pcs / 12),
      rate,
      sale_rate: rate + 140 + (seq % 4) * 20,
      discount: "",
      discount_amount: 0,
      amount: pcs * rate,
    };
    allArticles.push(article);
    return article;
  });
  await savePurchase(admin.business_id, admin.id, {
    purchase_date: purchaseDate,
    supplier_id: "supp-primary",
    notes: `Repeat replenishment lot for Karachi wholesale counter ${p + 1}`,
    articles,
  });
}

let articleCursor = 0;
const pickLine = (position, rowCount, long = false) => {
  const source = allArticles[articleCursor++ % allArticles.length];
  const pcs = 2 + ((position * 3 + rowCount) % 9);
  const rate = source.sale_rate + (position % 4) * 10;
  return {
    article_no: source.article_no,
    purchase_number: "",
    size: source.size,
    description: long ? `${source.description} - color mix ${["navy", "maroon", "bottle green", "charcoal"][position % 4]} with extra note for wrapping` : source.description,
    unit: 12,
    quantity_pkt: round(pcs / 12),
    purchase_rate: source.rate,
    dzn: round(pcs / 12),
    pcs,
    rate,
    discount: position % 9 === 0 ? "3%" : position % 7 === 0 ? "15" : "",
  };
};
const lineAmount = (line) => {
  const gross = line.pcs * line.rate;
  if (String(line.discount).endsWith("%")) return gross - gross * Number.parseFloat(line.discount) / 100;
  return gross - line.pcs * Number(line.discount || 0);
};

const invoiceRecords = [];
async function makeInvoice({ date, customer, rows, numberTag = "", paymentMode = "partial", returns = 0 }) {
  const articles = Array.from({ length: rows }, (_, i) => pickLine(i + 1, rows, rows >= 22));
  const invoiceTotal = round(articles.reduce((sum, line) => sum + lineAmount(line), 0));
  const paymentAmount = paymentMode === "paid" ? invoiceTotal - returns : paymentMode === "unpaid" ? 0 : round((invoiceTotal - returns) * 0.45);
  const invoice = await InvoiceService.create(admin, {
    invoice_date: date,
    customer_id: customer[0],
    customer_name: customer[1],
    salesman_name: ["Asif", "Danish", "Waqas"][rows % 3],
    customer_phone: customer[3],
    customer_address: `${customer[5]}, ${customer[4]}`,
    articles,
  });
  const data = invoice.data;
  if (numberTag) {
    const tagged = `${data.invoice_number}-${numberTag}`;
    db.prepare("UPDATE invoices SET invoice_number=? WHERE id=?").run(tagged, data.id);
    data.invoice_number = tagged;
  }
  if (returns > 0) {
    await createReturn({
      businessId: admin.business_id,
      userId: admin.id,
      type: "sales",
      body: {
        return_date: date,
        party_id: customer[0],
        party_name: customer[1],
        linked_invoice_id: data.id,
        notes: "Size exchange / damaged packing return",
        articles: articles.slice(0, Math.min(2, articles.length)).map((line) => ({ ...line, pcs: 1 })),
      },
    });
  }
  const returnAmount = Number(db.prepare("SELECT COALESCE(SUM(total_amount),0) amount FROM returns WHERE linked_invoice_id=?").get(data.id).amount);
  if (paymentAmount > 0) {
    const method = ["cash", "cheque", "slip", "online"][rows % 4];
    await addInvoicePayment({
      businessId: admin.business_id,
      userId: admin.id,
      invoiceId: data.id,
      payment: {
        payment_date: date,
        method,
        amount: Math.max(0, round(paymentMode === "paid" ? invoiceTotal - returnAmount : paymentAmount)),
        reference_no: `RCV-${String(data.id).padStart(5, "0")}`,
        bank_name: method === "cheque" ? "Meezan Bank" : "",
        cheque_no: method === "cheque" ? `CHQ${83000 + Number(data.id)}` : "",
        slip_no: method === "slip" ? `SLP${91000 + Number(data.id)}` : "",
        transaction_id: method === "online" ? `IBFT${Date.now()}${data.id}` : "",
        notes: paymentMode === "paid" ? "Settled against invoice" : "Part payment received",
      },
    });
  }
  invoiceRecords.push({ id: Number(data.id), invoice_number: data.invoice_number, customer: customer[1], rows });
}

const stressCounts = [7, 8, 10, 11, 22, 24, 28, 30, 36, 40, 42];
for (let i = 0; i < stressCounts.length; i += 1) {
  await makeInvoice({
    date: `2026-07-${String(5 + i).padStart(2, "0")}`,
    customer: customers[(i % (customers.length - 1)) + 1],
    rows: stressCounts[i],
    numberTag: `ROWS-${stressCounts[i]}`,
    paymentMode: i % 3 === 0 ? "paid" : i % 3 === 1 ? "partial" : "unpaid",
    returns: i % 4 === 0 ? 1 : 0,
  });
}

for (let i = 0; i < 38; i += 1) {
  await makeInvoice({
    date: `2026-${String(2 + Math.floor(i / 7)).padStart(2, "0")}-${String(3 + (i % 24)).padStart(2, "0")}`,
    customer: customers[0],
    rows: 2 + (i % 4),
    paymentMode: i % 5 === 0 ? "unpaid" : i % 4 === 0 ? "paid" : "partial",
    returns: i % 6 === 0 ? 1 : 0,
  });
  if (i % 3 === 0) {
    const latest = db.prepare("SELECT * FROM invoices WHERE customer_id=? ORDER BY id DESC LIMIT 1").get(customers[0][0]);
    const balance = Number(latest.balance_amount || 0);
    if (balance > 500) {
      await addInvoicePayment({
        businessId: admin.business_id,
        userId: admin.id,
        invoiceId: latest.id,
        payment: { payment_date: latest.invoice_date, method: "cash", amount: round(balance * 0.25), reference_no: `ADJ-${latest.invoice_number}`, notes: "Second counter receipt" },
      });
    }
  }
}

const purchases = db.prepare("SELECT * FROM purchases WHERE supplier_id=? ORDER BY purchase_date,id").all("supp-primary");
for (let i = 0; i < purchases.length; i += 2) {
  const items = db.prepare("SELECT * FROM purchase_items WHERE purchase_id=? ORDER BY position LIMIT 2").all(purchases[i].id);
  await createReturn({
    businessId: admin.business_id,
    userId: admin.id,
    type: "purchase",
    body: {
      return_date: `2026-${String(3 + Math.floor(i / 4)).padStart(2, "0")}-${String(10 + i).padStart(2, "0")}`,
      party_id: "supp-primary",
      party_name: suppliers[0][1],
      linked_purchase_id: purchases[i].id,
      stock_action: i % 4 === 0 ? "keep_goods" : "return_stock",
      adjustment: i % 4 === 0 ? { value: "25" } : {},
      notes: i % 4 === 0 ? "Supplier allowance for shade variation, goods retained" : "Returned short/damaged pieces to supplier",
      articles: items.map((item) => ({
        article_no: item.article_no,
        purchase_number: purchases[i].purchase_number,
        qr_id: item.qr_id,
        description: item.description,
        pcs: 6 + (i % 5),
        rate: item.rate,
      })),
    },
  });
}

db.prepare("UPDATE businesses SET invoice_counter_last=(SELECT MAX(CAST(SUBSTR(invoice_number,6,4) AS INTEGER)) FROM invoices WHERE business_id=businesses.id), updated_at=?").run(iso("2026-09-07"));
db.pragma("wal_checkpoint(TRUNCATE)");

const validate = () => {
  const businessId = Number(db.prepare("SELECT business_id FROM users WHERE username='admin'").get()?.business_id || 0);
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  const fk = db.prepare("PRAGMA foreign_key_check").all();
  const adminRow = db.prepare("SELECT * FROM users WHERE username='admin' AND is_active=1").get();
  const expectedTables = ["businesses", "users", "customers", "suppliers", "purchases", "purchase_items", "invoices", "invoice_items", "invoice_payments", "returns", "return_items", "inventory_movements", "commerce_counters"];
  const existingTables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  const matrix = db.prepare(`
    SELECT i.id,i.invoice_number,i.customer_name,COUNT(ii.id) row_count,i.total_amount,i.received_amount,i.balance_amount,
      CASE WHEN COALESCE((SELECT SUM(total_amount) FROM returns r WHERE r.linked_invoice_id=i.id),0)>0 THEN 1 ELSE 0 END has_returns
    FROM invoices i JOIN invoice_items ii ON ii.invoice_id=i.id
    WHERE i.invoice_number LIKE '%ROWS-%'
    GROUP BY i.id
    ORDER BY CAST(SUBSTR(i.invoice_number, INSTR(i.invoice_number, 'ROWS-') + 5) AS INTEGER)
  `).all();
  const totalProblems = db.prepare(`
    SELECT i.invoice_number FROM invoices i
    JOIN (SELECT invoice_id,SUM(gross_amount) gross,SUM(discount_amount) discount,SUM(amount) net FROM invoice_items GROUP BY invoice_id) x ON x.invoice_id=i.id
    WHERE ABS(i.gross_amount-x.gross)>0.01 OR ABS(i.total_discount_amount-x.discount)>0.01 OR ABS(i.net_amount-x.net)>0.01
       OR ABS(i.total_amount-(i.net_amount-i.sales_return_amount))>0.01
       OR ABS(i.received_amount-COALESCE((SELECT SUM(amount) FROM invoice_payments p WHERE p.invoice_id=i.id),0))>0.01
  `).all();
  const customerLedger = getPartyLedger("customers", businessId, "cust-primary", {});
  const supplierLedger = getPartyLedger("suppliers", businessId, "supp-primary", {});
  const rangeCustomer = getPartyLedger("customers", businessId, "cust-primary", { date_from: "2026-04-01", date_to: "2026-07-31" });
  const rangeSupplier = getPartyLedger("suppliers", businessId, "supp-primary", { date_from: "2026-03-01", date_to: "2026-06-30" });
  return {
    outputPath,
    integrity,
    foreignKeyProblems: fk.length,
    expectedTablesPresent: expectedTables.every((table) => existingTables.has(table)),
    adminActive: Boolean(adminRow),
    passwordMatches: Boolean(adminRow && bcrypt.compareSync("admin123", adminRow.password_hash)),
    matrix,
    invoiceTotalsValid: totalProblems.length === 0,
    totalProblems,
    customerStatement: { name: customers[0][1], rows: customerLedger.rows.length, opening: customerLedger.opening_balance, closing: customerLedger.closing_balance, rangeOpening: rangeCustomer.opening_balance, rangeClosing: rangeCustomer.closing_balance },
    supplierStatement: { name: suppliers[0][1], rows: supplierLedger.rows.length, opening: supplierLedger.opening_balance, closing: supplierLedger.closing_balance, rangeOpening: rangeSupplier.opening_balance, rangeClosing: rangeSupplier.closing_balance },
  };
};

const report = validate();
fs.writeFileSync(path.join(path.dirname(outputPath), "TexTradeOS_Print_Stress_Test.validation.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
db.close();
