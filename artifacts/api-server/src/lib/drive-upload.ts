/**
 * Google Drive upload helpers.
 * Uses the Drive REST API v3 directly (no googleapis package needed).
 */

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

/** Find or create the top-level "Daybook" folder in the user's Drive. */
export async function getOrCreateDaybookFolder(accessToken: string): Promise<string> {
  const query = new URLSearchParams({
    q: "name='Daybook' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: "files(id,name)",
    pageSize: "1",
  });

  const searchRes = await fetch(`${DRIVE_FILES_URL}?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error(`Drive folder search failed (${searchRes.status}): ${err}`);
  }

  const searchData = (await searchRes.json()) as { files: Array<{ id: string }> };
  if (searchData.files?.length > 0) {
    return searchData.files[0].id;
  }

  // Create the folder
  const createRes = await fetch(DRIVE_FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Daybook",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Drive folder creation failed (${createRes.status}): ${err}`);
  }

  const folder = (await createRes.json()) as { id: string };
  return folder.id;
}

/**
 * Upload a file buffer to a Drive folder using multipart upload.
 * Returns the Drive file ID.
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  content: Buffer | Uint8Array | string,
): Promise<string> {
  const boundary = "daybook_multipart_boundary";
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  const contentBuffer =
    typeof content === "string"
      ? Buffer.from(content, "utf-8")
      : Buffer.from(content);

  const bodyParts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    contentBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ];

  const body = Buffer.concat(bodyParts);

  const uploadQuery = new URLSearchParams({ uploadType: "multipart", fields: "id" });
  const res = await fetch(`${DRIVE_UPLOAD_URL}?${uploadQuery}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { id?: string; error?: unknown };
  if (!data.id) {
    throw new Error(`Drive upload returned no file ID: ${JSON.stringify(data.error)}`);
  }
  return data.id;
}

/**
 * Upload a planner PDF buffer to the user's Daybook Drive folder.
 * Returns the Drive file ID, or null if the user has no Google token.
 */
export async function uploadPlannerPdf(
  accessToken: string | null | undefined,
  plannerId: string,
  pdfBuffer: Buffer | Uint8Array,
): Promise<string | null> {
  if (!accessToken) return null;
  const folderId = await getOrCreateDaybookFolder(accessToken);
  const fileName = `daybook-planner-${plannerId}.pdf`;
  return uploadFileToDrive(accessToken, folderId, fileName, "application/pdf", pdfBuffer);
}

/**
 * Upload a planner config JSON to the user's Daybook Drive folder.
 * Returns the Drive file ID, or null if the user has no Google token.
 */
export async function uploadPlannerConfig(
  accessToken: string | null | undefined,
  plannerId: string,
  config: unknown,
): Promise<string | null> {
  if (!accessToken) return null;
  const folderId = await getOrCreateDaybookFolder(accessToken);
  const fileName = `daybook-config-${plannerId}.json`;
  const json = JSON.stringify(config, null, 2);
  return uploadFileToDrive(accessToken, folderId, fileName, "application/json", json);
}
