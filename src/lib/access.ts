// توقيع/التحقق من كوكي الدخول المشترك (يعمل في Edge و Node)
import { jwtVerify, SignJWT } from "jose";

export const ACCESS_COOKIE = "hayra_access";
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30; // 30 يوم

function secret(): Uint8Array {
  const s = process.env.ACCESS_JWT_SECRET;
  if (!s || s.length < 32) throw new Error("ACCESS_JWT_SECRET مفقود أو قصير (32 حرفًا على الأقل)");
  return new TextEncoder().encode(s);
}

export async function signAccessToken(version: number): Promise<string> {
  return new SignJWT({ v: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_MAX_AGE}s`)
    .setIssuer("hayra")
    .sign(secret());
}

export async function readAccessToken(token: string | undefined): Promise<{ v: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "hayra" });
    return typeof payload.v === "number" ? { v: payload.v } : null;
  } catch {
    return null;
  }
}
