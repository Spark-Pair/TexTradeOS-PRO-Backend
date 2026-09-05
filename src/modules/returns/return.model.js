import { db } from "../../db/connection.js";

const num = (value) => Number(value || 0);

export const ReturnModel = {
  transaction(action) { return db.transaction(action); },
  nextNumber(businessId, type, date) {
    const year = new Date(`${date}T00:00:00`).getFullYear();
    const prefix = type === "sales" ? "SR" : "PR";
    const row = db.prepare("SELECT return_number FROM returns WHERE business_id=? AND return_type=? AND return_number LIKE ? ORDER BY CAST(SUBSTR(return_number, 9) AS INTEGER) DESC LIMIT 1").get(businessId, type, `${prefix}-${year}-%`);
    const last = Number(String(row?.return_number || "").split("-").pop()) || 0;
    return `${prefix}-${year}-${String(last + 1).padStart(4, "0")}`;
  },
  soldRemaining(businessId, partyId, articleNo, purchaseNumber, linkedInvoiceId) {
    const args=[businessId,articleNo]; let where="i.business_id=? AND ii.article_no=?";
    if(purchaseNumber){where+=" AND ii.purchase_number=?";args.push(purchaseNumber);} if(partyId){where+=" AND i.customer_id=?";args.push(partyId);} if(linkedInvoiceId){where+=" AND i.id=?";args.push(linkedInvoiceId);}
    const sold=num(db.prepare(`SELECT COALESCE(SUM(ii.pcs),0) qty FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ${where}`).get(...args)?.qty);
    const rargs=[businessId,articleNo]; let rwhere="r.business_id=? AND r.return_type='sales' AND ri.article_no=?";
    if(purchaseNumber){rwhere+=" AND ri.purchase_number=?";rargs.push(purchaseNumber);} if(partyId){rwhere+=" AND r.party_id=?";rargs.push(partyId);}
    const returned=num(db.prepare(`SELECT COALESCE(SUM(ri.pcs),0) qty FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ${rwhere}`).get(...rargs)?.qty);
    return Math.max(0,sold-returned);
  },
  purchaseRemaining(businessId, partyId, articleNo, purchaseNumber, linkedPurchaseId) {
    const args=[businessId,articleNo]; let where="p.business_id=? AND pi.article_no=?";
    if(purchaseNumber){where+=" AND p.purchase_number=?";args.push(purchaseNumber);} if(partyId){where+=" AND p.supplier_id=?";args.push(partyId);} if(linkedPurchaseId){where+=" AND p.id=?";args.push(linkedPurchaseId);}
    const purchased=num(db.prepare(`SELECT COALESCE(SUM(pi.quantity_pcs),0) qty FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id WHERE ${where}`).get(...args)?.qty);
    const rargs=[businessId,articleNo]; let rwhere="r.business_id=? AND r.return_type='purchase' AND ri.article_no=?";
    if(purchaseNumber){rwhere+=" AND ri.purchase_number=?";rargs.push(purchaseNumber);} if(partyId){rwhere+=" AND r.party_id=?";rargs.push(partyId);}
    if(linkedPurchaseId){rwhere+=" AND (r.linked_purchase_id=? OR (COALESCE(r.linked_purchase_id,'')='' AND ri.purchase_number=(SELECT purchase_number FROM purchases WHERE id=? AND business_id=?)))";rargs.push(String(linkedPurchaseId),String(linkedPurchaseId),businessId);}
    const returned=num(db.prepare(`SELECT COALESCE(SUM(ri.pcs),0) qty FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ${rwhere}`).get(...rargs)?.qty);
    return Math.max(0,purchased-returned);
  },
  insertReturn(values) { return db.prepare(`INSERT INTO returns (business_id,created_by,return_number,return_type,return_date,party_id,party_name,linked_invoice_id,linked_purchase_id,stock_action,adjustment_type,adjustment_value,gross_amount,adjustment_amount,total_amount,total_pcs,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values); },
  insertItem(values) { return db.prepare("INSERT INTO return_items (return_id,position,article_no,purchase_number,qr_id,source_document_id,description,pcs,rate,gross_amount,amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(...values); },
  insertMovement(values) { return db.prepare("INSERT INTO inventory_movements (business_id,movement_type,article_no,purchase_number,pcs,reference_type,reference_id,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(...values); },
  find(businessId,id){const row=db.prepare("SELECT * FROM returns WHERE id=? AND business_id=?").get(id,businessId);if(!row)return null;return {...row,articles:db.prepare("SELECT * FROM return_items WHERE return_id=? ORDER BY position").all(id),adjustment:{type:row.adjustment_type,value:row.adjustment_value}};},
  list(businessId,type){return db.prepare("SELECT * FROM returns WHERE business_id=? AND return_type=? ORDER BY return_date DESC,id DESC").all(businessId,type);},
  delete(businessId,id,returnType){return db.transaction(()=>{db.prepare("DELETE FROM inventory_movements WHERE business_id=? AND reference_type=? AND reference_id=?").run(businessId,returnType+"_return",String(id));return db.prepare("DELETE FROM returns WHERE id=? AND business_id=?").run(id,businessId).changes>0;})();},
  salesReturnableRows(businessId,partyId){return db.prepare(`SELECT ii.article_no,ii.purchase_number,MAX(ii.description) description,MAX(ii.rate) rate,SUM(ii.pcs) sold_pcs FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.business_id=? AND i.customer_id=? GROUP BY ii.article_no,ii.purchase_number`).all(businessId,String(partyId));},
};
