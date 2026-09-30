export const CLIPBOARD_CHUNK_BYTES = 192 * 1024;
const MAX_BYTES = 64 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ClipboardFile = { name: string; type: string; size: number };
export type NativeClipboardApi = {
  begin(requestId: string): Promise<ClipboardFile[]>;
  readChunk(requestId: string, index: number, offset: number): Promise<string>;
  release(requestId: string): Promise<void>;
};

/** Pull one chunk at a time. No movie-sized string crosses RN or WebView. */
export function createNativeClipboardController(options: {
  origin: string;
  clipboard: NativeClipboardApi | null;
  publish: (message: Record<string, unknown>) => void;
}) {
  type Request = { id: string; scope: string; files: ClipboardFile[]; index: number; offset: number; busy: boolean; timer: ReturnType<typeof setTimeout> };
  let active: Request | null = null;
  const release = (id: string) => { void options.clipboard?.release(id).catch(() => undefined); };
  const reset = () => {
    if (!active) return;
    clearTimeout(active.timer);
    const id = active.id;
    active = null;
    release(id);
  };
  const emit = (request: Request, message: Record<string, unknown>) => {
    if (active === request) options.publish({ version: 1, requestId: request.id, scope: request.scope, ...message });
  };
  const fail = (request: Request, error: unknown) => {
    if (active !== request) { release(request.id); return; }
    emit(request, { type: 'clipboard_error', error: error instanceof Error ? error.message : 'iOS could not paste this video. Use Attach files.' });
    reset();
  };
  const handle = (raw: string, url: string) => {
    let record: Record<string, unknown>;
    try {
      if (new URL(url).origin !== options.origin || raw.length > 2048) return false;
      record = JSON.parse(raw);
    } catch { return false; }
    if (!record || record.version !== 1 || typeof record.type !== 'string' || !record.type.startsWith('clipboard_')) return false;
    if (typeof record.requestId !== 'string' || !UUID.test(record.requestId) || typeof record.scope !== 'string' || !record.scope || record.scope.length > 240) return true;
    const id = record.requestId;
    const scope = record.scope;
    if (record.type === 'clipboard_begin') {
      if (active) {
        if (active.id !== id) options.publish({ version: 1, type: 'clipboard_error', requestId: id, scope, error: 'Wait for the current video paste to finish.' });
        return true;
      }
      const request: Request = { id, scope, files: [], index: 0, offset: 0, busy: true, timer: setTimeout(() => fail(request, new Error('Video paste timed out. Use Attach files.')), 120_000) };
      active = request;
      if (!options.clipboard) { fail(request, new Error('This app build cannot recover video paste. Use Attach files.')); return true; }
      void options.clipboard.begin(id).then(files => {
        if (active !== request) { release(id); return; }
        if (!Array.isArray(files) || files.length < 1 || files.length > 3 || files.some(file => !file || typeof file.name !== 'string' || file.name.length > 200 || !file.type?.startsWith('video/') || !Number.isSafeInteger(file.size) || file.size <= 0) || files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) throw new Error('iOS supplied an invalid or oversized clipboard video.');
        request.files = files;
        request.busy = false;
        emit(request, { type: 'clipboard_manifest', files });
      }).catch(error => fail(request, error));
      return true;
    }
    const request = active;
    if (!request || request.id !== id || request.scope !== scope) return true;
    if (record.type === 'clipboard_cancel') { reset(); return true; }
    if (record.type !== 'clipboard_next' || request.busy || record.index !== request.index || record.offset !== request.offset || !request.files[request.index]) return true;
    request.busy = true;
    const { index, offset } = request;
    const expected = Math.min(CLIPBOARD_CHUNK_BYTES, request.files[index].size - offset);
    void options.clipboard!.readChunk(id, index, offset).then(data => {
      if (active !== request) return;
      // Native always returns a full chunk except the final file chunk.
      if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length !== Math.ceil(expected / 3) * 4) throw new Error('The video clipboard transfer was incomplete.');
      request.offset += expected;
      if (request.offset === request.files[index].size) { request.index++; request.offset = 0; }
      request.busy = false;
      emit(request, { type: 'clipboard_chunk', index, offset, data });
    }).catch(error => fail(request, error));
    return true;
  };
  return { handle, reset };
}
