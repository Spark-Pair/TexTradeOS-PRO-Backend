import bcrypt from "bcryptjs";
import { newSessionId, signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth.js";
import { toUserDto } from "../db/mappers.js";
import { now } from "../utils.js";
import { UserModel } from "../models/user.model.js";
import { SessionModel } from "../models/session.model.js";

export const AuthService = {
  login({ username, password, userAgent = "", ip = "" }) {
    const user = UserModel.findByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) { const error=new Error("Invalid username or password");error.status=401;throw error; }
    if (!user.is_active) { const error=new Error("User is inactive");error.status=403;throw error; }
    const sessionId=newSessionId();const refreshToken=signRefreshToken(user,sessionId);SessionModel.create({id:sessionId,userId:user.id,refreshToken,userAgent,ip,createdAt:now()});
    return { accessToken:signAccessToken(user),refreshToken,sessionId,user:toUserDto(user) };
  },
  refresh({ refreshToken, sessionId }) {
    const payload=verifyRefreshToken(refreshToken);
    if(String(payload.sid)!==sessionId)throw new Error("Session mismatch");
    if(!SessionModel.findActive(sessionId,refreshToken))throw new Error("Session not found");
    const user=UserModel.findById(payload.sub);if(!user||!user.is_active)throw new Error("User unavailable");
    SessionModel.touch(sessionId,now());return { accessToken:signAccessToken(user) };
  },
  logout({ sessionId, userId }) { if(sessionId)SessionModel.revoke(sessionId,userId,now());return {success:true}; },
  updateShortcuts({ userId, shortcuts }) { UserModel.updateShortcuts(userId,shortcuts,now());return {shortcuts}; },
};
