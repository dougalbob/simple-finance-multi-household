/**
 * Small framework-free display formatters shared by server pages and client
 * islands. Keep this module dependency-free: anything here must be safe to
 * bundle into a `'use client'` component, so no Node-only imports.
 */

/**
 * Human-readable attachment size (the chip and the Documents search results):
 * exact bytes under a kilobyte, whole KB thereafter, one decimal once
 * megabytes are reached. One implementation so every surface prints the same
 * label.
 */
export function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(0)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
