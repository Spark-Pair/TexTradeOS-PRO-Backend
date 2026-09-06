import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { toUserDto } from "./db/mappers.js";
import { UserModel } from "./models/user.model.js";

const isProduction = process.env.NODE_ENV === "production";
const readSecret = (name, developmentFallback) => { const value=String(process.env[name]||"").trim(); if(value)return value; if(isProduction)throw new Error(`${name} is required in production`); return developmentFallback; };
const JWT_SECRET=readSecret("JWT_SECRET","dev-secret");
const JWT_REFRESH_SECRET=readSecret("JWT_REFRESH_SECRET","dev-refresh-secret");
export const signAccessToken=(user)=>jwt.sign({sub:String(user.id),role:user.role},JWT_SECRET,{expiresIn:"2h"});
export const signRefreshToken=(user,sessionId)=>jwt.sign({sub:String(user.id),sid:sessionId},JWT_REFRESH_SECRET,{expiresIn:"30d"});
export const verifyRefreshToken=(token)=>jwt.verify(token,JWT_REFRESH_SECRET);
export const newSessionId=()=>uuidv4();
export const requireAuth=(req,res,next)=>{const header=req.headers.authorization||"",token=header.startsWith("Bearer ")?header.slice(7):"";if(!token)return res.status(401).json({message:"Missing token"});try{const payload=jwt.verify(token,JWT_SECRET),user=UserModel.findById(payload.sub);if(!user||!user.is_active)return res.status(401).json({message:"Invalid user"});req.user=user;req.userDto=toUserDto(user);return next();}catch{return res.status(401).json({message:"Invalid token"});}};
export const requireDeveloper=(req,res,next)=>{if(req.user?.role!=="developer")return res.status(403).json({message:"Developer access required"});return next();};
export const requireBusinessAdmin=(req,res,next)=>{if(req.user?.role==="developer"||req.user?.role==="admin")return next();return res.status(403).json({message:"Admin access required"});return next();};
