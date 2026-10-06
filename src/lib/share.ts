// Sharing the backup file through the phone's share sheet (Drive, WhatsApp, email...).

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

type ShareNav = {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
};

/** Can this browser share a file? (Chrome on Android can; most desktop browsers cannot.) */
export function canShareFiles(file: File, nav: ShareNav = navigator as unknown as ShareNav): boolean {
  try {
    return typeof nav.share === 'function' && !!nav.canShare && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Opens the share sheet with the backup file.
 * 'shared' = the sheet reported success (it cannot tell us where the file went),
 * 'cancelled' = you closed the sheet, 'unsupported' = this browser cannot share files.
 * Any other failure is thrown so the caller can fall back to a normal download.
 */
export async function shareFile(
  name: string,
  text: string,
  type: string,
  nav: ShareNav = navigator as unknown as ShareNav
): Promise<ShareResult> {
  const file = new File([text], name, { type });
  if (!canShareFiles(file, nav)) return 'unsupported';
  try {
    await nav.share!({ files: [file], title: 'HabitFlow backup' });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}
