import { db } from "../../db/connection.js";

export const findSourcePayment = (businessId, source, id) => source === "invoice"
  ? db.prepare("SELECT id,method,amount FROM invoice_payments WHERE business_id=? AND id=?").get(businessId, id)
  : db.prepare("SELECT id,method,amount,party_type,bank_account_id,cheque_type FROM party_payments WHERE business_id=? AND id=?").get(businessId, id);

export const listClearances = (businessId, source, paymentId) => db.prepare(`
  SELECT pc.id,pc.clearance_date,COALESCE(NULLIF(pc.settlement_method,''),pc.clearance_method) settlement_method,pc.amount,pc.reference_no,pc.notes,pc.bank_account_id,pc.settlement_bank_name,pc.settlement_date,
    ba.account_title bank_account_title,ba.bank_name bank_account_bank
  FROM payment_clearances pc
  LEFT JOIN bank_accounts ba ON ba.business_id=pc.business_id AND ba.id=pc.bank_account_id
  WHERE pc.business_id=? AND pc.payment_source=? AND pc.payment_id=?
  ORDER BY pc.clearance_date DESC,pc.id DESC
`).all(businessId, source, paymentId);

export const insertClearance = (values) => db.prepare(`
  INSERT INTO payment_clearances (business_id,payment_source,payment_id,created_by,clearance_date,clearance_method,amount,reference_no,bank_account_id,notes,created_at,updated_at,settlement_method,settlement_bank_name,settlement_date)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`).run(...values);
