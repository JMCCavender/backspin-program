/* GET /api/leaderboard — progress standings, any signed-in user.
 *
 * Auth: Clerk session JWT in the Authorization header. Unlike /api/roster
 * this is NOT admin-gated, so it returns only aggregate stats per user —
 * counts and quiz points, never per-video detail.
 */
import { createClerkClient, verifyToken } from "@clerk/backend";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "missing token" });

  try {
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    const list = await clerk.users.getUserList({ limit: 200 });
    const users = list.data.map((u) => {
      const p = u.unsafeMetadata?.progress || {};
      const scores = Object.values(p.quiz || {})
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3);
      return {
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "?",
        watched: Object.keys(p.watched || {}).length,
        quizzes: scores.length,
        quizPoints: scores.reduce((s, n) => s + n, 0),
        perfect: scores.filter((n) => n === 3).length,
      };
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ users });
  } catch (e) {
    return res.status(401).json({ error: "unauthorized" });
  }
}
