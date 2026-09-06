/** Read width/height from PNG or JPEG buffers without native deps. */
export function readImageDimensions(
  buffer: Buffer,
  mimeType: string
): { width: number; height: number } | null {
  const mime = mimeType.toLowerCase();

  if (mime.includes("png") && buffer.length >= 24) {
    const sig = buffer.readUInt32BE(0);
    if (sig === 0x89504e47) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }
  }

  if (mime.includes("jpeg") || mime.includes("jpg")) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      const len = buffer.readUInt16BE(offset + 2);
      if (len < 2) break;
      offset += 2 + len;
    }
  }

  return null;
}

export function orientationFromDimensions(
  width: number,
  height: number
): "landscape" | "portrait" | "square" {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}
