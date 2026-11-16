/** Builds a YouTube search link. No API key, no quota: the search opens on youtube.com. */
export function searchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
