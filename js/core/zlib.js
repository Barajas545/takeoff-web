// zlib.js — the zlib streams the .takeoff container is built from.
//
// Page blobs in a project file are zlib(PNG). Browsers ship that codec:
// DecompressionStream('deflate') and CompressionStream('deflate') both speak
// the zlib wrapper (RFC 1950), which is exactly what Python's zlib writes.
// So there is no library to vendor and nothing to load over the network.
//
// The one thing the native API will not do is let us pick a compression level.
// Python writes level 1 for speed; the browser writes its default. The result
// is a slightly smaller, slightly slower save, and every reader is happy with
// either — the level is a property of the encoder, never of the stream.
//
// A pako fallback is used when the native streams are missing, so an older
// browser still opens a project as long as the page chose to load pako.

const hasNative =
  typeof DecompressionStream !== 'undefined' &&
  typeof CompressionStream !== 'undefined';

function pako() {
  const p = globalThis.pako;
  if (!p) {
    throw new Error(
      'This browser cannot read compressed project data. ' +
      'Update to a current version of Chrome, Edge, Firefox or Safari.'
    );
  }
  return p;
}

async function pipe(bytes, stream) {
  // A zero-length view still has to reach the stream as a real chunk.
  const src = new Blob([bytes]).stream().pipeThrough(stream);
  const out = await new Response(src).arrayBuffer();
  return new Uint8Array(out);
}

/** zlib-compressed bytes → the original bytes. */
export async function inflate(bytes) {
  if (hasNative) {
    try {
      return await pipe(bytes, new DecompressionStream('deflate'));
    } catch (err) {
      // A raw-deflate stream (no zlib header) reaches us from nothing this app
      // writes, but a hand-built file might carry one. Try it before failing.
      try {
        return await pipe(bytes, new DecompressionStream('deflate-raw'));
      } catch { throw err; }
    }
  }
  return pako().inflate(bytes);
}

/** bytes → a zlib stream Python's zlib.decompress reads without complaint. */
export async function deflate(bytes) {
  if (hasNative) return pipe(bytes, new CompressionStream('deflate'));
  return pako().deflate(bytes, { level: 1 });
}

export const nativeCompression = hasNative;
