import { PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';
import { parseVideoUrl } from '@/src/lib/videoUtils';

interface ProjectWalkthroughProps {
  mediaList: PublicProjectMediaDto[];
  projectName: string;
}

export function ProjectWalkthrough({ mediaList, projectName }: ProjectWalkthroughProps) {
  if (!mediaList || mediaList.length === 0) return null;

  // Identify valid video media
  const validVideos = mediaList
    .map((m) => ({
      media: m,
      parsed: parseVideoUrl(m.url),
    }))
    .filter(
      (item) =>
        item.parsed.isValid ||
        (item.media.category || '').toUpperCase() === 'WALKTHROUGH' ||
        (item.media.mediaType || '').toUpperCase() === 'VIDEO'
    );

  if (validVideos.length === 0) {
    return null;
  }

  const primary = validVideos[0];
  const embedUrl = primary.parsed.embedUrl || primary.media.url;

  return (
    <section id="walkthrough" aria-labelledby="walkthrough-heading" className="space-y-6 pt-8 border-t border-[var(--color-border)]">
      <div>
        <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1">
          Video Presentation
        </div>
        <h2 id="walkthrough-heading" className="text-2xl font-display font-semibold text-[var(--color-foreground)]">
          Project Walkthrough
        </h2>
        <p className="text-xs text-[var(--color-foreground)]/65 mt-1 font-body">
          {primary.media.caption || primary.media.altText || `Architectural video walkthrough and cinematic preview for ${projectName}.`}
        </p>
      </div>

      <div className="relative aspect-video w-full max-w-4xl rounded-xl overflow-hidden border border-[var(--color-border)] bg-black shadow-md">
        {primary.parsed.provider === 'MP4' ? (
          <video
            src={embedUrl}
            controls
            className="w-full h-full object-contain"
          />
        ) : (
          <iframe
            src={embedUrl}
            title={`${projectName} Video Walkthrough`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
    </section>
  );
}
