import { extname } from "node:path";
const allowed: Record<string, { mime: string; magic: number[] }[]> = {
  ".pdf": [{ mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] }],
  ".png": [{ mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] }],
  ".jpg": [{ mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] }],
  ".jpeg": [{ mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] }],
  ".docx": [{ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [0x50, 0x4b] }]
};
export function validateUpload(file: File): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  if (file.size < 1 || file.size > 4 * 1024 * 1024) return { ok: false, error: "File must be 4 MB or smaller." };
  const candidates = allowed[extname(file.name).toLowerCase()];
  if (!candidates || !candidates.some((x) => x.mime === file.type)) return { ok: false, error: "Allowed file types are PDF, PNG, JPEG, and DOCX." };
  return { ok: true, bytes: Buffer.from([]) };
}
export async function validateUploadBytes(file: File) {
  const checked = validateUpload(file);
  if (!checked.ok) return checked;
  const bytes = Buffer.from(await file.arrayBuffer());
  const candidate = (allowed[extname(file.name).toLowerCase()] ?? []).find((x) => x.mime === file.type);
  if (!candidate || !candidate.magic.every((b, i) => bytes[i] === b)) return { ok: false as const, error: "The file contents do not match its declared type." };
  return { ok: true as const, bytes };
}
