import { RingApi } from "ring-client-api";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { format } from "date-fns";
import { Buffer } from "buffer";
import { Readable } from "stream";

export default async function handler(req, res) {
  try {
    const now = new Date();
    const dateStr = format(now, "dd-MM-yyyy");
    const timeStr = format(now, "HH:mm:ss");
    const filename = `${dateStr} ${timeStr}.jpg`;

    const ringApi = new RingApi({
      refreshToken: process.env.RING_REFRESH_TOKEN,
      cameraDingsPollSeconds: 0,
    });

    const locations = await ringApi.getLocations();
    const cameras = await locations[0].cameras;

    const snapshotBuffer = await cameras[0].getSnapshot();

    if (!snapshotBuffer) {
      return res.status(500).json({ error: "Snapshot failed" });
    }

    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, "base64").toString()
    );

    const auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: "v3", auth: authClient });

    const ringFolderId = await getOrCreateFolder(drive, "Ring.com");
    const dateFolderId = await getOrCreateFolder(drive, dateStr, ringFolderId);

    await drive.files.create({
      requestBody: {
        name: filename,
        parents: [dateFolderId],
      },
      media: {
        mimeType: "image/jpeg",
        body: Readable.from(snapshotBuffer),
      },
    });

    res.status(200).json({ success: true, filename });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}

async function getOrCreateFolder(drive, name, parentId) {
  const query = `'${
    parentId || "root"
  }' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
  });

  if (res.data.files?.length) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });

  return folder.data.id;
}
