import * as admin from "firebase-admin";
import { Request, Response, NextFunction } from "express";
import * as fs from "fs";

if (!admin.apps.length) {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
  const sa = JSON.parse(fs.readFileSync(path, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  console.log("Firebase Admin inicializado para proyecto:", sa.project_id);
}

export type AuthReq = Request & { user?: { uid: string; email?: string; name?: string } };

export async function requireAuth(req: AuthReq, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "missing_token" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email || undefined, name: decoded.name || undefined };
    next();
  } catch (e: any) {
    console.error("verifyIdToken failed:", e?.code, e?.message);
    res.status(401).json({ error: "invalid_token", code: e?.code, message: e?.message });
  }
}
