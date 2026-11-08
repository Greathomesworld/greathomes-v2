/**
 * Great Homes V2 — Video Utilities
 * Safe parsing, normalization, validation, and embed generation for project walkthrough videos.
 * Supports YouTube, Vimeo, and direct hosted MP4 URLs.
 */

export type VideoProvider = 'YOUTUBE' | 'VIMEO' | 'MP4' | 'UNKNOWN';

export interface ParsedVideo {
  isValid: boolean;
  provider: VideoProvider;
  providerLabel: string;
  originalUrl: string;
  embedUrl: string | null;
  watchUrl?: string;
  videoId?: string;
  startTime?: number;
  error?: string;
}

/**
 * Parses time string like '1h30m15s', '90s', or '90' into seconds.
 */
function parseTimeString(timeStr?: string | null): number | undefined {
  if (!timeStr) return undefined;
  const raw = timeStr.trim();
  if (/^\d+$/.test(raw)) {
    return parseInt(raw, 10);
  }
  let totalSeconds = 0;
  const hoursMatch = raw.match(/(\d+)h/i);
  const minutesMatch = raw.match(/(\d+)m/i);
  const secondsMatch = raw.match(/(\d+)s/i);

  if (!hoursMatch && !minutesMatch && !secondsMatch) {
    const numOnly = parseInt(raw, 10);
    return isNaN(numOnly) ? undefined : numOnly;
  }

  if (hoursMatch) totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
  if (minutesMatch) totalSeconds += parseInt(minutesMatch[1], 10) * 60;
  if (secondsMatch) totalSeconds += parseInt(secondsMatch[1], 10);

  return totalSeconds > 0 ? totalSeconds : undefined;
}

/**
 * Validates and normalizes supported video URLs safely.
 * Rejects unsupported protocols (e.g. javascript:, data:, file:) and malformed input.
 */
export function parseVideoUrl(rawUrl?: string | null): ParsedVideo {
  const fallback: ParsedVideo = {
    isValid: false,
    provider: 'UNKNOWN',
    providerLabel: 'Unknown',
    originalUrl: rawUrl || '',
    embedUrl: null,
    error: 'No video URL provided.',
  };

  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }

  let trimmed = rawUrl.trim();
  if (!trimmed) {
    return fallback;
  }

  // Auto-prepend https:// if admin entered hostname without scheme
  if (!/^https?:\/\//i.test(trimmed)) {
    if (
      trimmed.startsWith('youtube.com') ||
      trimmed.startsWith('www.youtube') ||
      trimmed.startsWith('m.youtube') ||
      trimmed.startsWith('youtu.be') ||
      trimmed.startsWith('vimeo.com') ||
      trimmed.startsWith('www.vimeo') ||
      trimmed.startsWith('player.vimeo')
    ) {
      trimmed = `https://${trimmed}`;
    }
  }

  // Strictly check protocol
  let parsedUrlObj: URL;
  try {
    parsedUrlObj = new URL(trimmed);
  } catch {
    return {
      ...fallback,
      originalUrl: trimmed,
      error: 'Invalid URL format. Please include https://',
    };
  }

  if (parsedUrlObj.protocol !== 'https:' && parsedUrlObj.protocol !== 'http:') {
    return {
      ...fallback,
      originalUrl: trimmed,
      error: 'Unsupported protocol. Only http:// and https:// URLs are permitted.',
    };
  }

  const hostname = parsedUrlObj.hostname.toLowerCase();
  const pathname = parsedUrlObj.pathname;
  const searchParams = parsedUrlObj.searchParams;

  // 1. YouTube handling
  // Hosts: youtube.com, www.youtube.com, m.youtube.com, youtu.be, www.youtube-nocookie.com
  if (
    hostname === 'youtube.com' ||
    hostname === 'www.youtube.com' ||
    hostname === 'm.youtube.com' ||
    hostname === 'youtu.be' ||
    hostname === 'www.youtube-nocookie.com'
  ) {
    let videoId: string | null = null;

    if (hostname === 'youtu.be') {
      videoId = pathname.slice(1).split('/')[0] || null;
    } else if (pathname.startsWith('/embed/')) {
      videoId = pathname.replace('/embed/', '').split('/')[0] || null;
    } else if (pathname.startsWith('/shorts/')) {
      videoId = pathname.replace('/shorts/', '').split('/')[0] || null;
    } else if (pathname.startsWith('/live/')) {
      videoId = pathname.replace('/live/', '').split('/')[0] || null;
    } else if (pathname.startsWith('/v/')) {
      videoId = pathname.replace('/v/', '').split('/')[0] || null;
    } else if (searchParams.has('v')) {
      videoId = searchParams.get('v');
    }

    // Clean videoId: 11 characters typically (letters, numbers, hyphens, underscores)
    if (videoId && /^[a-zA-Z0-9_-]{6,16}$/.test(videoId)) {
      // Parse optional start parameter
      const rawStart = searchParams.get('start') || searchParams.get('t');
      const startSeconds = parseTimeString(rawStart);
      const startParam = startSeconds ? `&start=${startSeconds}` : '';

      return {
        isValid: true,
        provider: 'YOUTUBE',
        providerLabel: 'YouTube',
        originalUrl: trimmed,
        // Use standard trusted YouTube embed with rel=0 and enablejsapi=1 for event listeners
        embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1${startParam}`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
        startTime: startSeconds,
      };
    }

    return {
      isValid: false,
      provider: 'YOUTUBE',
      providerLabel: 'YouTube',
      originalUrl: trimmed,
      embedUrl: null,
      error: 'Could not extract a valid YouTube video ID from this link.',
    };
  }

  // 2. Vimeo handling
  // Hosts: vimeo.com, www.vimeo.com, player.vimeo.com
  if (
    hostname === 'vimeo.com' ||
    hostname === 'www.vimeo.com' ||
    hostname === 'player.vimeo.com'
  ) {
    let videoId: string | null = null;

    if (pathname.startsWith('/video/')) {
      videoId = pathname.replace('/video/', '').split('/')[0] || null;
    } else {
      const match = pathname.match(/\/(\d+)/);
      if (match) {
        videoId = match[1];
      }
    }

    if (videoId && /^\d+$/.test(videoId)) {
      return {
        isValid: true,
        provider: 'VIMEO',
        providerLabel: 'Vimeo',
        originalUrl: trimmed,
        embedUrl: `https://player.vimeo.com/video/${videoId}?dnt=1`,
        watchUrl: `https://vimeo.com/${videoId}`,
        videoId,
      };
    }

    return {
      isValid: false,
      provider: 'VIMEO',
      providerLabel: 'Vimeo',
      originalUrl: trimmed,
      embedUrl: null,
      error: 'Could not extract a valid Vimeo numeric video ID from this link.',
    };
  }

  // 3. Hosted MP4 handling
  if (pathname.toLowerCase().endsWith('.mp4')) {
    return {
      isValid: true,
      provider: 'MP4',
      providerLabel: 'Hosted MP4',
      originalUrl: trimmed,
      embedUrl: trimmed,
      watchUrl: trimmed,
    };
  }

  return {
    isValid: false,
    provider: 'UNKNOWN',
    providerLabel: 'Unknown Provider',
    originalUrl: trimmed,
    embedUrl: null,
    error: 'Unsupported video provider. Please provide a YouTube, Vimeo, or hosted MP4 video link.',
  };
}

/**
 * Returns thumbnail image URL if available for provider (e.g. YouTube).
 */
export function getVideoThumbnail(parsed: ParsedVideo): string | null {
  if (parsed.isValid && parsed.provider === 'YOUTUBE' && parsed.videoId) {
    return `https://img.youtube.com/vi/${parsed.videoId}/hqdefault.jpg`;
  }
  return null;
}
