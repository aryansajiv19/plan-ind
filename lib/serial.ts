// Runs async tasks one at a time, in call order. A failed task rejects only
// its own caller and does not block the next. Used for writes whose order
// matters (use-vote-actions.ts: a quick re-pick must not land before the pick
// it replaces).
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
