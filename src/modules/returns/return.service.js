import { now } from "../../utils.js";
import { ReturnModel } from "./return.model.js";

const num=(v)=>Number.isFinite(Number(String(v??"").replace(/,/g,"")))?Number(String(v??"").replace(/,/g,"")):0;
const text=(v)=>String(v??"").trim();
const fail=(status,message)=>Object.assign(new Error(message),{status});

const discountDetails=(input,base,perPiece=false)=>{const raw=text(input);if(!raw)return{raw:"",type:"none",value:0,amount:0};if(raw.endsWith("%")){const value=Math.min(100,Math.max(0,num(raw.slice(0,-1))));return{raw,type:"percent",value,amount:base*value/100};}const value=Math.max(0,num(raw));return{raw,type:"amount",value,amount:perPiece?value:value};};

export function calculateReturnTotals(items,adjustment={}){
  const normalized=items.map((item,position)=>{const pcs=Math.max(0,num(item.pcs));const rate=Math.max(0,num(item.rate));const gross=pcs*rate;const discount=discountDetails(item.discount,gross,true);const discountAmount=discount.type==="percent"?discount.amount:Math.min(gross,pcs*discount.value);return{position,article_no:text(item.article_no),purchase_number:text(item.purchase_number),qr_id:text(item.qr_id),source_document_id:text(item.source_id||item.source_document_id),description:text(item.description),pcs,rate,gross_amount:gross,discount:discount.raw,discount_type:discount.type==="none"?"":discount.type==="amount"?"rupee":"percent",discount_amount:discountAmount,amount:Math.max(0,gross-discountAmount)};});
  if(!normalized.length||normalized.some(i=>!i.article_no||i.pcs<=0))throw fail(400,"Every return item needs an article and positive quantity");
  const gross=normalized.reduce((s,i)=>s+i.gross_amount,0);const itemNet=normalized.reduce((s,i)=>s+i.amount,0);const pcs=normalized.reduce((s,i)=>s+i.pcs,0);
  const totalDiscount=discountDetails(adjustment?.value,itemNet);let calculated=Math.max(0,itemNet-Math.min(itemNet,totalDiscount.amount));
  const explicit=text(adjustment?.total_amount);if(explicit!=="")calculated=Math.max(0,Math.min(itemNet,num(explicit)));
  return{items:normalized,gross_amount:gross,total_pcs:pcs,adjustment_type:totalDiscount.type,adjustment_value:totalDiscount.value,adjustment_input:totalDiscount.raw,adjustment_amount:gross-calculated,total_amount:calculated};
}

function assertNoDuplicateReturnArticles(items){const seen=new Set();for(const item of items){const key=`${item.article_no}::${item.purchase_number||""}::${item.source_document_id||""}`;if(seen.has(key))throw fail(409,`${item.article_no}: duplicate return item`);seen.add(key);}}

export function createReturn({businessId,userId,type,body={}}){if(!["sales","purchase"].includes(type))throw fail(400,"Invalid return type");const date=text(body.return_date)||new Date().toISOString().slice(0,10);const partyId=text(body.party_id);const partyName=text(body.party_name);if(!partyName)throw fail(400,type==="sales"?"Customer is required":"Supplier is required");const totals=calculateReturnTotals(Array.isArray(body.articles)?body.articles:[],body.adjustment);assertNoDuplicateReturnArticles(totals.items);const stockAction=body.stock_action==="keep_goods"?"keep_goods":"return_stock";const timestamp=now();
  const create=ReturnModel.transaction(()=>{
    for(const item of totals.items){const sourceId=type==="sales"?text(item.source_document_id)||text(body.linked_invoice_id):body.linked_purchase_id;const remaining=type==="sales"?ReturnModel.soldRemaining(businessId,partyId,item.article_no,item.purchase_number,sourceId):ReturnModel.purchaseRemaining(businessId,partyId,item.article_no,item.purchase_number,sourceId);if(item.pcs>remaining)throw fail(409,type==="sales"?`${item.article_no}: only ${remaining} pcs are returnable`:`${item.article_no}: only ${remaining} pcs are returnable from this purchase`);}
    const number=ReturnModel.nextNumber(businessId,type,date);
    const result=ReturnModel.insertReturn([businessId,userId,number,type,date,partyId||null,partyName,body.linked_invoice_id||null,text(body.linked_purchase_id)||null,stockAction,totals.adjustment_type,totals.adjustment_value,totals.adjustment_input,totals.gross_amount,totals.adjustment_amount,totals.total_amount,totals.total_pcs,text(body.notes),timestamp,timestamp]);
    totals.items.forEach(i=>{ReturnModel.insertItem([result.lastInsertRowid,i.position,i.article_no,i.purchase_number,i.qr_id,i.source_document_id,i.description,i.pcs,i.rate,i.gross_amount,i.discount,i.discount_type,i.discount_amount,i.amount]);if(stockAction==="return_stock")ReturnModel.insertMovement([businessId,type==="sales"?"sales_return_in":"purchase_return_out",i.article_no,i.purchase_number,type==="sales"?i.pcs:-i.pcs,type+"_return",String(result.lastInsertRowid),"",timestamp]);});
    return result.lastInsertRowid;
  });
  return ReturnModel.find(businessId,create.immediate());
}

export const getReturn=(businessId,id)=>ReturnModel.find(businessId,id);
export const listReturns=(businessId,type)=>ReturnModel.list(businessId,type);
export function deleteReturn(businessId,id){const row=ReturnModel.find(businessId,id);if(!row)return false;return ReturnModel.delete(businessId,id,row.return_type);}
export function salesReturnable(businessId,partyId){return ReturnModel.salesReturnableRows(businessId,partyId).map(r=>({...r,available_pcs:ReturnModel.soldRemaining(businessId,String(partyId),r.article_no,r.purchase_number,r.source_id)})).filter(r=>r.available_pcs>0);}
