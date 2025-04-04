import { RingApi } from "ring-client-api";
import { google } from "googleapis";
import { Readable } from "stream";
import dotenv from "dotenv";
dotenv.config();

const RING_FOLDER_ID = "1Di7wUq25vc3zLX9twSUeLWZf6hWQruVm";

export default async function handler(req, res) {
  const now = new Date();
  const timeZoneOffset = 2; // Amsterdam is UTC+2

  // Bereken de Amsterdamse tijd
  const amsterdamTime = new Date(
    now.getTime() + timeZoneOffset * 60 * 60 * 1000
  );

  // Formatteer de datum en tijd voor de bestandsnaam
  const day = amsterdamTime.getDate().toString().padStart(2, "0");
  const month = (amsterdamTime.getMonth() + 1).toString().padStart(2, "0");
  const year = amsterdamTime.getFullYear();
  const hours = amsterdamTime.getHours().toString().padStart(2, "0");
  const minutes = amsterdamTime.getMinutes().toString().padStart(2, "0");
  const seconds = amsterdamTime.getSeconds().toString().padStart(2, "0");

  const filename = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;

  console.log(`Bestandsnaam timestamp: ${filename}`);
  console.log(`Huidige UTC tijd: ${now.toISOString()}`);
  console.log(`Geconverteerde Amsterdam tijd: ${amsterdamTime.toISOString()}`);

  const ringApi = new RingApi({
    refreshToken: process.env.RING_REFRESH_TOKEN,
    cameraDingsPollSeconds: 0,
  });

  const locations = await ringApi.getLocations();
  const cameras = await locations[0]?.cameras;
  const snapshotBuffer = await cameras[0]?.getSnapshot();

  console.log(`Snapshot buffer size: ${snapshotBuffer?.length}`);

  if (!snapshotBuffer || snapshotBuffer.length === 0) {
    return res.status(500).json({ error: "Snapshot failed or was empty" });
  }

  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, "base64").toString()
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  const dateFolderId = await getOrCreateFolder(
    drive,
    filename.split(" ")[0],
    RING_FOLDER_ID
  );

  await drive.files.create({
    requestBody: {
      name: filename + ".jpg",
      parents: [dateFolderId],
    },
    media: {
      mimeType: "image/jpeg",
      body: Readable.from(snapshotBuffer),
    },
    fields: "id",
  });

  console.log(`✅ Bestand geüpload: ${filename}`);
  console.log(
    `Open map: https://drive.google.com/drive/folders/${dateFolderId}`
  );

  res.status(200).json({ success: true, filename });
}

async function getOrCreateFolder(drive, name, parentId) {
  const query = `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

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
      parents: [parentId],
    },
    fields: "id",
  });

  return folder.data.id;
}
