// src/lib/storage.ts
import {
  ref,
  listAll,
  list,
  getDownloadURL,
  getMetadata,
  StorageReference,
} from "firebase/storage";
import { storage } from "../lib/firebase"; // ✅ ruta relativa correcta

// ========= Tipos =========
export type StorageItem = {
  name: string;
  path: string;
  url: string;
  contentType?: string;
  updated?: string;
  size?: number;
};

export type AbcMediaItem = {
  /** Letra/etiqueta: A, B, C... */
  label: string;
  /** URL pública (signed) para mostrar/descargar */
  url: string;
  /** Tipo de recurso para el render */
  kind?: "image" | "video";
  /** Nota opcional */
  note?: string;
  /** Nombre original del archivo */
  name?: string;
};

// ========= Config / Utilidades =========
const BASE = "modules/ABECEDARIO";
const SEGMENT_TO_PREFIX: Record<"A_I" | "J_R" | "S_Z", string> = {
  A_I: `${BASE}/A_I`,
  J_R: `${BASE}/J_R`,
  S_Z: `${BASE}/S_Z`,
};

const cleanPrefix = (p: string) =>
  p.replace(/^\/+/, "").replace(/\/+$/, "") + "/";

const isVideoByExt = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);
const isImageByExt = (url: string) =>
  /\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(url);

const kindFromContentType = (
  ct?: string
): "video" | "image" | undefined => {
  if (!ct) return undefined;
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("image/")) return "image";
  return undefined;
};

// Mini-cache en memoria (5 min)
const cache = new Map<string, { at: number; items: StorageItem[] }>();
const TTL_MS = 5 * 60 * 1000;

// ========= Listar recursivo =========
export async function listFilesUnder(prefix: string): Promise<StorageItem[]> {
  const key = `ALL:${prefix}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.items;

  const baseRef = ref(storage, cleanPrefix(prefix));
  const out: StorageItem[] = [];

  const walk = async (r: StorageReference) => {
    try {
      const res = await listAll(r);

      // Archivos del nivel actual
      for (const item of res.items) {
        try {
          const [url, meta] = await Promise.all([
            getDownloadURL(item),
            getMetadata(item),
          ]);

          out.push({
            name: item.name,
            path: item.fullPath,
            url,
            contentType: meta.contentType,
            updated: meta.updated,
            size: meta.size,
          });
        } catch (e) {
          console.warn("No se pudo obtener metadatos/URL:", item.fullPath, e);
        }
      }

      // Subcarpetas
      for (const folder of res.prefixes) {
        await walk(folder);
      }
    } catch (err) {
      console.error("Error al listar:", r.fullPath, err);
    }
  };

  await walk(baseRef);

  out.sort((a, b) => a.name.localeCompare(b.name));

  cache.set(key, { at: now, items: out });
  return out;
}

// ========= Helpers adicionales =========
export async function getFileUrl(path: string): Promise<string | null> {
  try {
    const fileRef = ref(storage, path);
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.error("No se pudo obtener el archivo:", path, err);
    return null;
  }
}

/** Listado paginado (para carpetas muy grandes) */
export async function listFilesPaged(
  prefix: string,
  maxResults = 100
): Promise<{ items: StorageItem[]; nextPageToken?: string }> {
  const folderRef = ref(storage, cleanPrefix(prefix));
  try {
    const res = await list(folderRef, { maxResults });
    const items: StorageItem[] = [];

    for (const item of res.items) {
      const [url, meta] = await Promise.all([
        getDownloadURL(item),
        getMetadata(item),
      ]);
      items.push({
        name: item.name,
        path: item.fullPath,
        url,
        contentType: meta.contentType,
        updated: meta.updated,
        size: meta.size,
      });
    }

    return { items, nextPageToken: res.nextPageToken };
  } catch (err) {
    console.error("Error al listar paginado:", err);
    return { items: [] };
  }
}

// ========= API específica para ABECEDARIO (usada por LessonMedia) =========
export async function getAbecedarioUrls(
  segment: "A_I" | "J_R" | "S_Z"
): Promise<AbcMediaItem[]> {
  const prefix = SEGMENT_TO_PREFIX[segment];

  const files = await listFilesUnder(prefix);

  const items: AbcMediaItem[] = files.map((f) => {
    // label desde el nombre sin extensión (A, B, C...)
    const base = f.name.replace(/\.[^.]+$/, "");
    const label = base.toUpperCase();

    // deduce tipo
    const byCT = kindFromContentType(f.contentType);
    const kind =
      byCT ||
      (isVideoByExt(f.url)
        ? "video"
        : isImageByExt(f.url)
        ? "image"
        : undefined);

    return {
      label,
      url: f.url,
      kind,
      name: f.name,
    };
  });

  items.sort((a, b) =>
    a.label.localeCompare(b.label, "es", { numeric: true })
  );

  return items;
}
