/* GET /api/roster — full user list with progress, admins only.
 *
 * Auth: Clerk session JWT in the Authorization header. The caller must have
 * publicMetadata.role === 'admin' (set via Clerk dashboard/API, never
 * client-writable). Runs on Vercel with CLERK_SECRET_KEY in env.
 */
import { createClerkClient, verifyToken } from "@clerk/backend";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "missing token" });

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    const caller = await clerk.users.getUser(payload.sub);
    if (caller.publicMetadata?.role !== "admin") {
      return res.status(403).json({ error: "admin only" });
    }

    const list = await clerk.users.getUserList({ limit: 200 });
    const users = list.data.map((u) => ({
      id: u.id,
      username: u.username,
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      lastActiveAt: u.lastActiveAt,
      progress: u.unsafeMetadata?.progress || null,
    }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ users });
  } catch (e) {
    return res.status(401).json({ error: "unauthorized" });
  }
}
