// Pure queue operations (so "add to queue" behaves the same everywhere and can be tested).

/**
 * Add to queue / play next. If the song is already queued it is MOVED to just after the current song instead of being added twice.
 * @returns {{queue:any[], index:number, action:'added'|'next-added'|'moved'|'already-next'|'current'}}
 */
export function queueAdd({ queue, index, item, mode }) {
  const at = queue.findIndex((q, i) => q.id === item.id && i !== index);
  if (queue[index]?.id === item.id && at < 0) return { queue, index, action: 'current' };                  // it is the song playing right now
  if (at >= 0) {
    const cur = at < index ? index - 1 : index;                                                              // removing an earlier item shifts the current one up
    if (at === cur + 1) return { queue, index, action: 'already-next' };
    const rest = queue.filter((_, i) => i !== at);
    return { queue: [...rest.slice(0, cur + 1), queue[at], ...rest.slice(cur + 1)], index: cur, action: 'moved' };
  }
  if (mode === 'next') return { queue: [...queue.slice(0, index + 1), item, ...queue.slice(index + 1)], index, action: 'next-added' };
  return { queue: [...queue, item], index, action: 'added' };
}
