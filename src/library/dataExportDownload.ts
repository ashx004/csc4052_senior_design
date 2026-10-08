export type DataExportDownload = {
  blob: Blob;
  filename: string;
};

function exportFilename(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || "catalyst-data-export.zip";
}

/** Request an owner-authorized export without navigating away from Settings. */
export async function requestDataExport(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<DataExportDownload> {
  const response = await fetcher("/api/account/data-export", {
    credentials: "include",
    cache: "no-store",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : "Unable to create a data export. Please try again.");
  }
  return {
    blob: await response.blob(),
    filename: exportFilename(response.headers.get("Content-Disposition")),
  };
}

export function downloadDataExport({ blob, filename }: DataExportDownload): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
