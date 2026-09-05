import { createReturn, deleteReturn, getReturn, listReturns, salesReturnable } from "./return.service.js";

const validType=(type)=>["sales","purchase"].includes(type);
const send=(res,action)=>{try{return action();}catch(error){return res.status(error.status||500).json({message:error.message||"Return operation failed"});}};

export const ReturnController={
  list:(req,res)=>send(res,()=>validType(req.params.type)?res.json({success:true,data:listReturns(req.user.business_id,req.params.type)}):res.status(400).json({message:"Invalid return type"})),
  returnable:(req,res)=>send(res,()=>res.json({success:true,data:salesReturnable(req.user.business_id,req.params.partyId)})),
  get:(req,res)=>send(res,()=>{if(!validType(req.params.type))return res.status(400).json({message:"Invalid return type"});const row=getReturn(req.user.business_id,req.params.id);if(!row||row.return_type!==req.params.type)return res.status(404).json({message:"Return not found"});return res.json({success:true,data:row});}),
  create:(req,res)=>send(res,()=>res.status(201).json({success:true,data:createReturn({businessId:req.user.business_id,userId:req.user.id,type:req.params.type,body:req.body})})),
  delete:(req,res)=>send(res,()=>{if(!validType(req.params.type))return res.status(400).json({message:"Invalid return type"});const row=getReturn(req.user.business_id,req.params.id);if(!row||row.return_type!==req.params.type)return res.status(404).json({message:"Return not found"});deleteReturn(req.user.business_id,req.params.id);return res.json({success:true});}),
};
