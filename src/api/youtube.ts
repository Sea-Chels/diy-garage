/**
 * YouTube Data API v3 search. Optional: without a key the UI falls back to a
 * plain "search on YouTube" link. search.list costs 100 quota units; the free
 * daily quota is 10,000, so results are cached in localStorage for a week.
 */
export interface Video {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  publishedAt: string;
}

const CACHE_PREFIX = 'yt:';
const CACHE_TTL = 7 * 24 * 3600 * 1000;
const KEY_STORAGE = 'ytApiKey';

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_YT_API_KEY || '';
  } catch {
    return import.meta.env.VITE_YT_API_KEY || '';
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode */
  }
}

export function searchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export class QuotaError extends Error {}

export async function searchVideos(query: string, max = 8): Promise<Video[]> {
  const key = getApiKey();
  if (!key) throw new Error('no-key');

  const cacheKey = CACHE_PREFIX + query.toLowerCase();
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { t, v } = JSON.parse(raw) as { t: number; v: Video[] };
      if (Date.now() - t < CACHE_TTL) return v;
    }
  } catch {
    /* ignore */
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    relevanceLanguage: 'en',
    maxResults: String(max),
    q: query,
    key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (res.status === 403) throw new QuotaError('quota');
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  const json = (await res.json()) as {
    items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } }[];
  };
  const videos: Video[] = json.items
    .filter((i) => i.id?.videoId)
    .map((i) => ({
      id: i.id.videoId,
      title: decodeEntities(i.snippet.title),
      channel: i.snippet.channelTitle,
      thumb: i.snippet.thumbnails.medium?.url ?? i.snippet.thumbnails.default?.url ?? '',
      publishedAt: i.snippet.publishedAt,
    }));
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: videos }));
  } catch {
    /* ignore */
  }
  return videos;
}

function decodeEntities(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}
