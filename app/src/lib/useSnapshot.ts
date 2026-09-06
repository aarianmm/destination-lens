import { useEffect, useState } from 'react';

export type SnapshotState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

/**
 * Minimal async hook. Deliberately not a data-fetching library: snapshots are
 * static files, cached in `snapshots.ts`, and never refetched within a session.
 */
export function useSnapshot<T>(loader: () => Promise<T>, deps: unknown[]): SnapshotState<T> {
  const [state, setState] = useState<SnapshotState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loader().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (error: Error) => !cancelled && setState({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
