/** Client-safe flags only — never expose secrets. */
export function googleOAuthConfigured() {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";
}
