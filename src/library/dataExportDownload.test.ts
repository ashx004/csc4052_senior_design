import { describe, expect, it, vi } from "vitest";
import { requestDataExport } from "./dataExportDownload";

describe("requestDataExport", () => {
  it("uses the current token, disables caching, and reads export metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("zip", {
      headers: {
        "Content-Disposition": "attachment; filename=\"catalyst-data-export.zip\"",
      },
    }));

    const download = await requestDataExport("fresh-token", fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/account/data-export", expect.objectContaining({
      credentials: "include",
      cache: "no-store",
      headers: { Authorization: "Bearer fresh-token" },
    }));
    expect(download.filename).toBe("catalyst-data-export.zip");
  });

  it("surfaces the endpoint's safe error message", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(
      { error: "Catalyst file storage (MinIO) is unavailable. Please try again later." },
      { status: 503 }
    ));

    await expect(requestDataExport("fresh-token", fetcher)).rejects.toThrow("Catalyst file storage (MinIO) is unavailable.");
  });
});
