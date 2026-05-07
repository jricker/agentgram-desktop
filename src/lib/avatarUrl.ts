/**
 * Rewrite a Supabase Storage public URL to its on-the-fly transform variant.
 *
 * Supabase serves bytes verbatim at:
 *   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * The transform variant lives at a different path:
 *   https://<proj>.supabase.co/storage/v1/render/image/public/<bucket>/<path>
 *
 * Critically, the `/object/public/` endpoint **silently ignores** transform
 * query params (width/height/resize/quality), so calling `?width=64` on it
 * is a no-op. We have to swap the path.
 *
 * Pass-through for non-Supabase URLs (e.g. OAuth provider photos).
 * Preserves any existing query params (cache-buster `?t=...`, etc.).
 */
export function avatarUrl(url: string | null | undefined, size: number): string | undefined {
  if (!url) return undefined;
  if (!url.includes("/storage/v1/object/public/")) return url;

  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/"
    );
    u.searchParams.set("width", String(size));
    u.searchParams.set("height", String(size));
    u.searchParams.set("resize", "cover");
    u.searchParams.set("quality", "80");
    return u.toString();
  } catch {
    return url;
  }
}
