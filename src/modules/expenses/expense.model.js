import { db } from "../../db/connection.js";

export const ExpenseModel = {
  list(businessId) {
    return db.prepare("SELECT * FROM expenses WHERE business_id=? ORDER BY expense_date DESC, id DESC").all(businessId);
  },
  insert(values) {
    return db.prepare(`INSERT INTO expenses (business_id,created_by,expense_date,category,paid_to,method,amount,reference_no,bank_name,cheque_date,slip_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values);
  },
  find(businessId, id) {
    return db.prepare("SELECT * FROM expenses WHERE business_id=? AND id=?").get(businessId, id);
  },
  delete(businessId, id) {
    return db.prepare("DELETE FROM expenses WHERE business_id=? AND id=?").run(businessId, id);
  },
};
