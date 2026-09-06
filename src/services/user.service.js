import bcrypt from "bcryptjs";
import { toUserDto } from "../db/mappers.js";
import { now, paginate } from "../utils.js";
import { UserModel } from "../models/user.model.js";
import { SessionModel } from "../models/session.model.js";

const filterUsers=(rows,query={})=>{let filtered=[...rows];const name=String(query.name||"").toLowerCase().trim(),status=String(query.status||"").toLowerCase().trim();if(name)filtered=filtered.filter((row)=>String(row.name||"").toLowerCase().includes(name));if(status==="active")filtered=filtered.filter((row)=>row.isActive);if(status==="inactive")filtered=filtered.filter((row)=>!row.isActive);return filtered;};
const stats=(rows)=>{const total=rows.length,active=rows.filter((row)=>Boolean(row.is_active)).length;return{success:true,data:{total,active,inactive:total-active}};};
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const UserService={
  listAll(query){return paginate(filterUsers(UserModel.listAll().map(toUserDto),query),query);},allStats(){return stats(UserModel.statusRows());},listBusiness(businessId,query){return paginate(filterUsers(UserModel.listByBusiness(businessId).map(toUserDto),query),query);},businessStats(businessId){return stats(UserModel.statusRows(businessId));},
  createBusinessUser(businessId,payload={}){const name=String(payload.name||"").trim(),username=String(payload.username||"").trim(),password=String(payload.password||"").trim(),role=String(payload.role||"staff").trim();if(!name||!username||!password)throw fail(400,"Name, username, and password are required");if(role==="developer")throw fail(400,"Cannot create developer users here");const timestamp=now();try{const result=UserModel.create({businessId,name,username,passwordHash:bcrypt.hashSync(password,10),role,timestamp});return{id:String(result.lastInsertRowid),success:true};}catch(error){if(String(error.message).includes("UNIQUE"))throw fail(409,"Username already exists");throw error;}},
  toggleStatus(id,businessId=null){const user=UserModel.findManaged(id,businessId);if(!user)throw fail(404,"User not found");const next=user.is_active?0:1;UserModel.toggleStatus(user.id,next,now());return{id:String(user.id),isActive:Boolean(next)};},
  resetPassword(id,password,businessId=null){const cleanPassword=String(password||"").trim();if(!cleanPassword)throw fail(400,"New password is required");const user=UserModel.findManaged(id,businessId);if(!user)throw fail(404,"User not found");UserModel.updatePassword(user.id,bcrypt.hashSync(cleanPassword,10),now());return{success:true};},
  delete(id,businessId,currentUserId){if(String(id)===String(currentUserId))throw fail(400,"You cannot delete your own user account");const user=UserModel.findManaged(id,businessId);if(!user)throw fail(404,"User not found");if(UserModel.createdInvoiceCount(user.id)>0)throw fail(409,"This user cannot be deleted because they have created invoices");UserModel.delete(user.id);return{success:true,id:String(user.id)};},
  activeSessions(){const rows=SessionModel.listActiveByUser();return{data:rows.map((row)=>({...row,userId:String(row.userId)}))};},revokeSessions(id){SessionModel.revokeAllForUser(id,now());return{success:true};},
};
