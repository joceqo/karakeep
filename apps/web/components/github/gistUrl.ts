export function parseGistUrl(
  url: string,
): { gistId: string; owner?: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "gist.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 1) return { gistId: parts[0] };
    if (parts.length >= 2) return { owner: parts[0], gistId: parts[1] };
    return null;
  } catch {
    return null;
  }
}
