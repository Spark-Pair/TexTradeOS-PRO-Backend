import { now } from "../../utils.js";
import { ReturnModel } from "./return.model.js";

const num=(v)=>Number.isFinite(Number(v))?Number(v):0; const text=(v)=>String(v??"").trim();
const validAdjustments=new Set(["none","per_piece","percent","round","keep_per_piece","keep_percent","keep_amount"]);
const fail=(status,message)=>Object.assign(new Error(message),{status});

export function calculateReturnTotals(items,adjustment={}){const normalized=items.map((item,position)=>{const pcs=Math.max(0,num(item.pcs));const rate=Math.max(0,num(item.rate));return{position,article_no:text(item.article_no),purchase_number:text(item.purchase_number),qr_id:text(item.qr_id),source_document_id:text(item.source_id||item.source_document_id),description:text(item.description),pcs,rate,gross_amount:pcs*rate};});if(!normalized.length||normalized.some(i=>!i.article_no||i.pcs<=0))throw fail(400,"Every return item needs an article and positive quantity");const gross=normalized.reduce((s,i)=>s+i.gross_amount,0);const pcs=normalized.reduce((s,i)=>s+i.pcs,0);const type=validAdjustments.has(adjustment?.type)?adjustment.type:"none";const value=Math.max(0,num(adjustment?.value));let amount=gross;if(type==="per_piece"||type==="keep_per_piece")amount=Math.max(0,gross-pcs*value);else if(type==="percent"||type==="keep_percent")amount=Math.max(0,gross-gross*Math.min(100,value)/100);else if(type==="keep_amount")amount=Math.max(0,gross-value);else if(type==="round")amount=Math.max(0,value);return{items:normalized.map(i=>({...i,amount:i.gross_amount})),gross_amount:gross,total_pcs:pcs,adjustment_type:type,adjustment_value:value,adjustment_amount:gross-amount,total_amount:amount};}

function assertNoDuplicateReturnArticles(items){const seen=new Set();for(const item of items){const key=`${item.article_no}::${item.purchase_number||""}`;if(seen.has(key))throw fail(409,`${item.article_no}: duplicate return item`);seen.add(key);}}

export function createReturn({businessId,userId,type,body={}}){if(!["sales","purchase"].includes(type))throw fail(400,"Invalid return type");const date=text(body.return_date)||new Date().toISOString().slice(0,10);const partyId=text(body.party_id);const partyName=text(body.party_name);if(!partyName)throw fail(400,type==="sales"?"Customer is required":"Supplier is required");const totals=calculateReturnTotals(Array.isArray(body.articles)?body.articles:[],body.adjustment);assertNoDuplicateReturnArticles(totals.items);const stockAction=String(body.stock_action||"").startsWith("keep")||totals.adjustment_type.startsWith("keep_")?"keep_goods":"return_stock";const timestamp=now();
  const create=ReturnModel.transaction(()=>{
    for(const item of totals.items){const remaining=type==="sales"?ReturnModel.soldRemaining(businessId,partyId,item.article_no,item.purchase_number,body.linked_invoice_id):ReturnModel.purchaseRemaining(businessId,partyId,item.article_no,item.purchase_number,body.linked_purchase_id);if(item.pcs>remaining)throw fail(409,type==="sales"?`${item.article_no}: only ${remaining} pcs are returnable`:`${item.article_no}: only ${remaining} pcs are returnable from this purchase`);}
    const number=ReturnModel.nextNumber(businessId,type,date);
    const result=ReturnModel.insertReturn([businessId,userId,number,type,date,partyId||null,partyName,body.linked_invoice_id||null,text(body.linked_purchase_id)||null,stockAction,totals.adjustment_type,totals.adjustment_value,totals.gross_amount,totals.adjustment_amount,totals.total_amount,totals.total_pcs,text(body.notes),timestamp,timestamp]);
    totals.items.forEach(i=>{ReturnModel.insertItem([result.lastInsertRowid,i.position,i.article_no,i.purchase_number,i.qr_id,i.source_document_id,i.description,i.pcs,i.rate,i.gross_amount,i.amount]);if(stockAction==="return_stock")ReturnModel.insertMovement([businessId,type==="sales"?"sales_return_in":"purchase_return_out",i.article_no,i.purchase_number,type==="sales"?i.pcs:-i.pcs,type+"_return",String(result.lastInsertRowid),"",timestamp]);});
    return result.lastInsertRowid;
  });
  return ReturnModel.find(businessId,create.immediate());
}

export const getReturn=(businessId,id)=>ReturnModel.find(businessId,id);
export const listReturns=(businessId,type)=>ReturnModel.list(businessId,type);
export function deleteReturn(businessId,id){const row=ReturnModel.find(businessId,id);if(!row)return false;return ReturnModel.delete(businessId,id,row.return_type);}
export function salesReturnable(businessId,partyId){return ReturnModel.salesReturnableRows(businessId,partyId).map(r=>({...r,available_pcs:ReturnModel.soldRemaining(businessId,String(partyId),r.article_no,r.purchase_number)})).filter(r=>r.available_pcs>0);}
