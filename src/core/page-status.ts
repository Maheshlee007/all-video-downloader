export interface ScanReport {
  count: number;
  mediaElements: number;
  blobElements: number;
  frameCount: number;
  missingFrameOrigins: string[];
}
export function scanSummary(report: ScanReport): string {
  if (report.count) return `Found ${report.count} media item(s) on this tab.`;
  if (report.missingFrameOrigins.length)
    return `Player access is missing for: ${report.missingFrameOrigins.join(', ')}. Enable cross-site detection or grant those hosts in Chrome, then reload and play.`;
  if (!report.mediaElements && !report.frameCount)
    return 'No player has loaded on this page. Start playback and check that the site itself works; blocked or failed player scripts can prevent detection.';
  if (report.blobElements)
    return 'A blob-backed player is present, but no downloadable manifest was found. Start playback, enable cross-site detection, then reload. Separate-track or protected players may need an unsupported engine.';
  return 'A player or embedded frame is present, but no downloadable media was found. Start playback, then scan again.';
}
export function pageNote(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com'))
    return 'This is a YouTube watch page. ClipNest does not yet include YouTube extraction or separate audio/video merging. Opening or scanning this page does not establish download support.';
  return 'This URL is a webpage, not a media file. Open it, start the video, then scan the tab. Embedded players may need cross-site detection. Site scripts and the player must load successfully first.';
}
