import { db } from "../../db.js";
import { now } from "../../utils.js";

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const text = (v) => String(v ?? "").trim();
const validAdjustments = new Set(["none","per_piece","percent","round","keep_per_piece","keep_percent","keep_amount"]);

export function calculateReturnTotals(items, adjustment = {}) {
  const normalized = items.map((item, position) => {
    const pcs = Math.max(0, num(item.pcs)); const rate = Math.max(0, num(item.rate));
    return { position, article_no:text(item.article_no), purchase_number:text(item.purchase_number), qr_id:text(item.qr_id), source_document_id:text(item.source_id || item.source_document_id), description:text(item.description), pcs, rate, gross_amount:pcs*rate };
  });
  if (!normalized.length || normalized.some((i) => !i.article_no || i.pcs <= 0)) throw Object.assign(new Error("Every return item needs an article and positive quantity"), { status:400 });
  const gross = normalized.reduce((s,i)=>s+i.gross_amount,0); const pcs = normalized.reduce((s,i)=>s+i.pcs,0);
  const type = validAdjustments.has(adjustment?.type) ? adjustment.type : "none"; const value = Math.max(0,num(adjustment?.value));
  let amount = gross;
  if (type === "per_piece" || type === "keep_per_piece") amount = Math.max(0, gross - pcs*value);
  else if (type === "percent" || type === "keep_percent") amount = Math.max(0, gross - gross*Math.min(100,value)/100);
  else if (type === "keep_amount") amount = Math.max(0, gross-value);
  else if (type === "round") amount = Math.max(0,value);
  return { items:normalized.map(i=>({...i,amount:i.gross_amount})), gross_amount:gross, total_pcs:pcs, adjustment_type:type, adjustment_value:value, adjustment_amount:gross-amount, total_amount:amount };
}

function nextReturnNumber(businessId, type, date) {
  const year = new Date(`${date}T00:00:00`).getFullYear(); const prefix = type === "sales" ? "SR" : "PR";
  const row = db.prepare("SELECT return_number FROM returns WHERE business_id=? AND return_type=? AND return_number LIKE ? ORDER BY id DESC LIMIT 1").get(businessId,type,`${prefix}-${year}-%`);
  const last = Number(String(row?.return_number||"").split("-").pop())||0; return `${prefix}-${year}-${String(last+1).padStart(4,"0")}`;
}

function soldRemaining(businessId, partyId, articleNo, purchaseNumber, linkedInvoiceId) {
  const args=[businessId, articleNo]; let invoiceWhere="i.business_id=? AND ii.article_no=?";
  if (purchaseNumber) { invoiceWhere += " AND ii.purchase_number=?"; args.push(purchaseNumber); }
  if (partyId) { invoiceWhere += " AND i.customer_id=?"; args.push(partyId); }
  if (linkedInvoiceId) { invoiceWhere += " AND i.id=?"; args.push(linkedInvoiceId); }
  const sold=num(db.prepare(`SELECT COALESCE(SUM(ii.pcs),0) qty FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ${invoiceWhere}`).get(...args)?.qty);
  const rargs=[businessId, articleNo]; let retWhere="r.business_id=? AND r.return_type='sales' AND ri.article_no=?";
  if (purchaseNumber) { retWhere += " AND ri.purchase_number=?"; rargs.push(purchaseNumber); }
  if (partyId) { retWhere += " AND r.party_id=?"; rargs.push(partyId); }
  const returned=num(db.prepare(`SELECT COALESCE(SUM(ri.pcs),0) qty FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ${retWhere}`).get(...rargs)?.qty);
  return Math.max(0,sold-returned);
}

export function createReturn({ businessId, userId, type, body }) {
  if (!['sales','purchase'].includes(type)) throw Object.assign(new Error("Invalid return type"),{status:400});
  const date=text(body.return_date)||new Date().toISOString().slice(0,10); const partyId=text(body.party_id); const partyName=text(body.party_name);
  if (!partyName) throw Object.assign(new Error(type==='sales'?"Customer is required":"Supplier is required"),{status:400});
  const totals=calculateReturnTotals(Array.isArray(body.articles)?body.articles:[], body.adjustment);
  const stockAction=String(body.stock_action||"").startsWith("keep") || totals.adjustment_type.startsWith("keep_") ? "keep_goods" : "return_stock";
  if (type==='sales') for (const item of totals.items) { const remaining=soldRemaining(businessId,partyId,item.article_no,item.purchase_number,body.linked_invoice_id); if (item.pcs>remaining) throw Object.assign(new Error(`${item.article_no}: only ${remaining} pcs are returnable`),{status:409}); }
  const timestamp=now(); const number=nextReturnNumber(businessId,type,date);
  const result=db.prepare(`INSERT INTO returns (business_id,created_by,return_number,return_type,return_date,party_id,party_name,linked_invoice_id,linked_purchase_id,stock_action,adjustment_type,adjustment_value,gross_amount,adjustment_amount,total_amount,total_pcs,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(businessId,userId,number,type,date,partyId||null,partyName,body.linked_invoice_id||null,text(body.linked_purchase_id)||null,stockAction,totals.adjustment_type,totals.adjustment_value,totals.gross_amount,totals.adjustment_amount,totals.total_amount,totals.total_pcs,text(body.notes),timestamp,timestamp);
  const insertItem=db.prepare("INSERT INTO return_items (return_id,position,article_no,purchase_number,qr_id,source_document_id,description,pcs,rate,gross_amount,amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  const insertMove=db.prepare("INSERT INTO inventory_movements (business_id,movement_type,article_no,purchase_number,pcs,reference_type,reference_id,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  totals.items.forEach(i=>{ insertItem.run(result.lastInsertRowid,i.position,i.article_no,i.purchase_number,i.qr_id,i.source_document_id,i.description,i.pcs,i.rate,i.gross_amount,i.amount); if(stockAction==='return_stock') insertMove.run(businessId,type==='sales'?'sales_return_in':'purchase_return_out',i.article_no,i.purchase_number,type==='sales'?i.pcs:-i.pcs,type+'_return',String(result.lastInsertRowid),'',timestamp); });
  return getReturn(businessId,result.lastInsertRowid);
}

export function getReturn(businessId,id){ const row=db.prepare("SELECT * FROM returns WHERE id=? AND business_id=?").get(id,businessId); if(!row)return null; return {...row,articles:db.prepare("SELECT * FROM return_items WHERE return_id=? ORDER BY position").all(id),adjustment:{type:row.adjustment_type,value:row.adjustment_value}}; }
export function listReturns(businessId,type){ return db.prepare("SELECT * FROM returns WHERE business_id=? AND return_type=? ORDER BY return_date DESC,id DESC").all(businessId,type); }
export function deleteReturn(businessId,id){ const row=getReturn(businessId,id); if(!row)return false; db.prepare("DELETE FROM inventory_movements WHERE business_id=? AND reference_type=? AND reference_id=?").run(businessId,row.return_type+'_return',String(id)); db.prepare("DELETE FROM returns WHERE id=? AND business_id=?").run(id,businessId); return true; }
export function salesReturnable(businessId,partyId){ const rows=db.prepare(`SELECT ii.article_no,ii.purchase_number,MAX(ii.description) description,MAX(ii.rate) rate,SUM(ii.pcs) sold_pcs FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.business_id=? AND i.customer_id=? GROUP BY ii.article_no,ii.purchase_number`).all(businessId,String(partyId)); return rows.map(r=>({...r,available_pcs:soldRemaining(businessId,String(partyId),r.article_no,r.purchase_number)})).filter(r=>r.available_pcs>0); }
