import { Router } from "express";
import { createReturn, deleteReturn, getReturn, listReturns, salesReturnable } from "./return.service.js";
export function createReturnRouter(requireAuth){ const router=Router(); router.use(requireAuth);
  router.get("/:type",(req,res)=>{ if(!['sales','purchase'].includes(req.params.type))return res.status(400).json({message:'Invalid return type'}); res.json({success:true,data:listReturns(req.user.business_id,req.params.type)}); });
  router.get("/sales/returnable/:partyId",(req,res)=>res.json({success:true,data:salesReturnable(req.user.business_id,req.params.partyId)}));
  router.get("/:type/:id",(req,res)=>{const row=getReturn(req.user.business_id,req.params.id); return row?res.json({success:true,data:row}):res.status(404).json({message:'Return not found'});});
  router.post("/:type",(req,res)=>{try{res.status(201).json({success:true,data:createReturn({businessId:req.user.business_id,userId:req.user.id,type:req.params.type,body:req.body})});}catch(e){res.status(e.status||500).json({message:e.message});}});
  router.delete("/:type/:id",(req,res)=>deleteReturn(req.user.business_id,req.params.id)?res.json({success:true}):res.status(404).json({message:'Return not found'})); return router; }
