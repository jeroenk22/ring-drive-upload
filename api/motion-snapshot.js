import { RingApi } from "ring-client-api";
import { google } from "googleapis";
import { Readable } from "stream";
import { formatInTimeZone, toZonedTime, getTimezoneOffset } from "date-fns-tz";
import { enGB } from "date-fns/locale/en-GB"; // Importeer de enGB locale
import dotenv from "dotenv";
dotenv.config();

const RING_FOLDER_ID = "1Di7wUq25vc3zLX9twSUeLWZf6hWQruVm";

export default async function handler(req, res) {
  const now = new Date();
  const timeZone = "Europe/Amsterdam";

  const localDate = toZonedTime(now, timeZone);

  const offset = getTimezoneOffset(timeZone, localDate);
  console.log(`Amsterdam time zone offset: ${offset / 60} hours`);

  console.log("localDate voor formating:", localDate);
  console.log("timeZone:", timeZone);

  const filename = formatInTimeZone(
    localDate,
    timeZone,
    "dd-MM-yyyy HH:mm:ss",
    { locale: enGB }
  ); // Gebruik de enGB locale

  console.log("bestandsnaam na formatting", filename);

  console.log(`Bestandsnaam timestamp: ${filename}`);
  console.log(`Huidige UTC tijd: ${now.toISOString()}`);
  console.log(`Geconverteerde Amsterdam tijd: ${localDate.toISOString()}`);

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
