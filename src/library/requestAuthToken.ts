export const SESSION_COOKIE = "fb_token";

export function getRequestAuthToken(input: {
  cookie?: string;
  authorization?: string | null;
}): string | null {
  if (input.cookie) return input.cookie;

  const header = input.authorization;
  if (!header) return null;

  const match = header.match(/^bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
