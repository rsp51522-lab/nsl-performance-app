const ADMIN_ID = "rsp51522";
const ADMIN_PASSWORD = "asano1866";
const COOKIE_NAME = "nsl_reward_admin";
const SESSION_VALUE = "reward-admin-v1";

export function isRewardAdmin(request: Request) {
  const cookie = request.headers.get("Cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${COOKIE_NAME}=${SESSION_VALUE}`);
}

export function isValidRewardAdminLogin(id?: string, password?: string) {
  return id === ADMIN_ID && password === ADMIN_PASSWORD;
}

export function rewardAdminCookie(maxAge: number) {
  return `${COOKIE_NAME}=${SESSION_VALUE}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
