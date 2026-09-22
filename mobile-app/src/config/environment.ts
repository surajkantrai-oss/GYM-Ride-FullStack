export function validateApiUrl(
  url: string | undefined,
  environment: string | undefined,
) {
  if (!url) return "";
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error("Invalid API URL");
  if (
    parsed.protocol !== "https:" &&
    !(environment === "development" && parsed.protocol === "http:")
  )
    throw new Error("HTTPS required outside development");
  return url.replace(/\/$/, "");
}
