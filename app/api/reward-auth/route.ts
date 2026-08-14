import { isRewardAdmin, isValidRewardAdminLogin, rewardAdminCookie } from "./session";

export async function GET(request: Request) {
  return Response.json({ authenticated: isRewardAdmin(request) });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { id?: string; password?: string }
    | null;

  if (!isValidRewardAdminLogin(payload?.id, payload?.password)) {
    return Response.json({ error: "IDまたはパスワードが違います。" }, { status: 401 });
  }

  return Response.json(
    { authenticated: true },
    { headers: { "Set-Cookie": rewardAdminCookie(60 * 60 * 8) } },
  );
}

export async function DELETE() {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": rewardAdminCookie(0) } },
  );
}
