/**
 * Shown when a read FAILED, in place of the empty state.
 *
 * An empty state makes a claim about the world — "you have not been
 * anywhere", "nobody here yet" — and that claim is false when the read
 * simply did not arrive. On a memory feature it is the worst possible
 * false claim: it tells someone their history is gone and invites them to
 * start over. This says only what is actually known.
 */
export default function UnavailableState({ what }: { what: string }) {
  return (
    <div className="demo-collection-empty" role="status">
      <strong>Couldn’t load your {what}.</strong>
      <p>
        The connection dropped on the way. Nothing has been lost — refresh to
        try again.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}
