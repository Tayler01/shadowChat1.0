export type BadgeDiagnostics = {
  status: 'reading' | 'read_failed' | 'auth_failed' | 'applying' | 'write_failed' | 'verified' | 'mismatch';
  expected: number | null;
  observed: number | null;
  at: number;
};

export function diagnosedBadgeOperations(options: {
  identity: () => string | null;
  read: () => Promise<unknown>;
  write: (count: number) => Promise<void>;
  readOS: () => Promise<number>;
  report: (state: BadgeDiagnostics) => void;
}) {
  const report = (identity: string | null, state: Omit<BadgeDiagnostics, 'at'>) => {
    if (identity && options.identity() === identity) options.report({ ...state, at: Date.now() });
  };
  return {
    read: async () => {
      const identity = options.identity();
      report(identity, { status: 'reading', expected: null, observed: null });
      try {
        const data = await options.read();
        const total = data && typeof data === 'object' && !Array.isArray(data) && 'total' in data ? data.total : null;
        if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) throw new Error('Invalid notification badge response.');
        return data;
      }
      catch (error) {
        const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
        report(identity, { status: status === 401 || status === 403 ? 'auth_failed' : 'read_failed', expected: null, observed: null });
        throw error;
      }
    },
    apply: async (count: number) => {
      const identity = options.identity();
      report(identity, { status: 'applying', expected: count, observed: null });
      try {
        await options.write(count);
        const observed = await options.readOS();
        report(identity, { status: observed === count ? 'verified' : 'mismatch', expected: count, observed });
      } catch (error) {
        report(identity, { status: 'write_failed', expected: count, observed: null });
        throw error;
      }
    },
  };
}
