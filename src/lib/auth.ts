import jwt, { JwtPayload } from "jsonwebtoken";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function issueToken(userId: string) {
  const secret = getSecret();
  const token = jwt.sign({ sub: userId }, secret, {
    expiresIn: "30d",
    algorithm: "HS256",
  });
  return token;
}

export function verifyAuth(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const secret = getSecret();
    const payload = jwt.verify(token, secret) as JwtPayload;

    const userId = payload.sub as string | undefined;
    if (!userId) return null;

    return { userId, payload };
  } catch (error) {
    console.error("JWT verification error:", error);
    return null;
  }
}

