// src/lib/storage.ts
import { getStorage, ref, listAll, getDownloadURL } from "firebase/storage";
import { app } from "./firebase";

export const storage = getStorage(app);

export type AbcMediaItem = {
  label: string;
  url: string;
  note?: string;
  kind?: "image" | "video"; // <-- nuevo (opcional para no romper consumidores)
  name?: string;            // <-- útil si luego quieres usarlo como key
};

function stripExt(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const VIDEO_EXT = [".mp4", ".mov", ".webm"];

function guessKind(filename: string): "image" | "video" {
  const f = filename.toLowerCase();
  if (IMAGE_EXT.some((ext) => f.endsWith(ext))) return "image";
  if (VIDEO_EXT.some((ext) => f.endsWith(ext))) return "video";
  return "image";
}

type FileInfo = { url: string; kind: "image" | "video"; name: string };

async function listFolderUrls(prefix: string): Promise<Record<string, FileInfo>> {
  const out: Record<string, FileInfo> = {};
  const folderRef = ref(storage, prefix);
  const { items } = await listAll(folderRef);
  await Promise.all(
    items.map(async (it) => {
      const key = stripExt(it.name);
      const url = await getDownloadURL(it);
      out[key] = { url, kind: guessKind(it.name), name: it.name };
    })
  );
  return out;
}

function findFile(
  files: Record<string, FileInfo>,
  label: string
): FileInfo | undefined {
  const candidates = [
    label,
    label.toLowerCase(),
    label.toUpperCase(),
    label.replace("Ch", "CH"),
    label.replace("Ch", "ch"),
    label.normalize("NFD").replace(/\p{Diacritic}/gu, ""), // Ñ -> N
  ];
  for (const k of candidates) {
    if (files[k]) return files[k];
  }
  return undefined;
}

export async function getAbecedarioUrls(
  segment: "A_I" | "J_R" | "S_Z"
): Promise<AbcMediaItem[]> {
  try {
    const prefix = `modules/ABECEDARIO/${segment}`;
    const files = await listFolderUrls(prefix);

    const ORDER: Record<typeof segment, string[]> = {
      A_I: ["A", "B", "C", "Ch", "D", "E", "F", "G", "H", "I"],
      J_R: ["J", "K", "L", "M", "N", "Ñ", "O", "P", "Q", "R"],
      S_Z: ["S", "T", "U", "V", "W", "X", "Y", "Z"],
    };

    const NOTES: Partial<Record<string, string>> = {
      A: "Puño cerrado, pulgar extendido hacia arriba.",
      B: "Palma hacia afuera, dedos juntos, pulgar cruzado.",
      C: "Mano formando una ‘C’.",
      Ch: "Índice extendido, resto flexionados (varía según estándar local).",
      D: "Índice arriba, resto doblados formando círculo.",
      E: "Dedos curvos hacia la palma.",
      F: "Pulgar y dedo índice formando círculo.",
      G: "Pulgar e índice marcan en la mejilla.",
      H: "Dos dedos hacia adelante (boca).",
      I: "Meñique extendido, resto doblados.",
    };

    const order = ORDER[segment] || [];
    const items: AbcMediaItem[] = [];

    for (const label of order) {
      const info = findFile(files, label);
      if (info) {
        items.push({
          label,
          url: info.url,
          note: NOTES[label],
          kind: info.kind,  // <-- ahora sabrás si es "video" o "image"
          name: info.name,
        });
      } else {
        console.warn(`[storage] No se encontró archivo para ${label} en ${prefix}`);
      }
    }

    return items;
  } catch (err) {
    console.error("[storage] getAbecedarioUrls error:", err);
    return [];
  }
}
