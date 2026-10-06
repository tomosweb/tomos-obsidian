const MAX_LONG_EDGE = 2048;
const MAX_BYTES = 10 * 1024 * 1024;

/** Optimize only the upload copy. GIF animation and unsupported formats stay intact. */
export async function optimizeImage(original: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) || typeof document === 'undefined') return original;
  let bitmap: ImageBitmap | undefined;
  let objectUrl: string | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const blob = new Blob([original], { type: mimeType });
    let source: CanvasImageSource;
    let width: number;
    let height: number;
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Image decoding failed'));
        image.src = objectUrl!;
      });
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    }
    if (!width || !height) return original;
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: mimeType !== 'image/jpeg' });
    if (!context) return original;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const output = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, mimeType, 0.82));
    if (!output || output.type !== mimeType || !output.size || output.size > MAX_BYTES) return original;
    if (scale === 1 && output.size >= original.byteLength) return original;
    return await output.arrayBuffer();
  } catch {
    // A decoder/encoder failure must not prevent an otherwise valid upload.
    return original;
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
