// One-shot downloader for exercise demo images. Run manually with
// `node scripts/fetch-imagenes.mjs` — never imported by the app, never
// served to the browser. Reads data/mapeo-imagenes.json (curated by hand,
// slug -> exact free-exercise-db name, or null when no decent match
// exists) and saves the first two frames of each matched exercise as
// data/ejercicios/<slug>-0.jpg and <slug>-1.jpg.
//
// Source: yuhonas/free-exercise-db (Unlicense, public domain).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const MAPEO_PATH = path.join(RAIZ, "data", "mapeo-imagenes.json");
const DEST_DIR = path.join(RAIZ, "data", "ejercicios");

const JSON_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMG_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

async function descargarBinario(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const mapeo = JSON.parse(await readFile(MAPEO_PATH, "utf8"));
  const ejercicios = await descargarBinario(JSON_URL).then((buf) =>
    JSON.parse(buf.toString("utf8"))
  );

  // Exact-name lookup only. A fuzzy match is exactly what produced the
  // wrong pairing this file exists to prevent (see brief tarea-10).
  const porNombre = new Map(ejercicios.map((e) => [e.name, e]));

  await mkdir(DEST_DIR, { recursive: true });

  const bajados = [];
  const sinMatch = [];
  const sinNombre = [];

  for (const [slug, nombre] of Object.entries(mapeo)) {
    if (nombre === null) {
      sinNombre.push(slug);
      continue;
    }

    const entrada = porNombre.get(nombre);
    if (!entrada || !entrada.images || entrada.images.length < 2) {
      console.log(`SIN MATCH: ${slug}`);
      sinMatch.push(slug);
      continue;
    }

    try {
      const [img0, img1] = entrada.images;
      const buf0 = await descargarBinario(IMG_BASE + img0);
      const buf1 = await descargarBinario(IMG_BASE + img1);
      await writeFile(path.join(DEST_DIR, `${slug}-0.jpg`), buf0);
      await writeFile(path.join(DEST_DIR, `${slug}-1.jpg`), buf1);
      bajados.push(slug);
      console.log(`OK: ${slug} <- ${nombre}`);
    } catch (err) {
      console.log(`SIN MATCH: ${slug} (error de descarga: ${err.message})`);
      sinMatch.push(slug);
    }
  }

  console.log("\n--- Resumen ---");
  console.log(`Bajados: ${bajados.length}`);
  console.log(`Sin nombre en el mapeo (null): ${sinNombre.length}${sinNombre.length ? " -> " + sinNombre.join(", ") : ""}`);
  console.log(`Sin match en el banco: ${sinMatch.length}${sinMatch.length ? " -> " + sinMatch.join(", ") : ""}`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exitCode = 1;
});
