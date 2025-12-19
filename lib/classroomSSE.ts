type SendFn = (payload: any) => void;

const clients = new Map<string, Set<SendFn>>();

export function registerClient(uuid: string, send: SendFn) {
  console.log(`[SSE] registerClient uuid=${uuid}`);
  let set = clients.get(uuid);
  if (!set) {
    set = new Set();
    clients.set(uuid, set);
  }
  set.add(send);
  console.log(`[SSE] registered client, total clients for uuid=${uuid}: ${set.size}`);
  return () => {
    console.log(`[SSE] unregistering client for uuid=${uuid}`);
    set!.delete(send);
    if (set!.size === 0) {
      clients.delete(uuid);
      console.log(`[SSE] no more clients for uuid=${uuid}, removed from map`);
    }
  };
}

export function broadcast(uuid: string, payload: any) {
  const set = clients.get(uuid);
  if (!set) {
    console.log(`[SSE] broadcast no-clients uuid=${uuid}`);
    return;
  }
  try {
    const preview = typeof payload === 'string' ? payload : JSON.stringify(payload).slice(0, 200);
    console.log(`[SSE] broadcasting uuid=${uuid} to ${set.size} client(s) payload=${preview}`);
  } catch (e) {
    console.log(`[SSE] broadcasting uuid=${uuid} to ${set.size} client(s)`);
  }
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (e) {
      console.warn(`[SSE] client send error uuid=${uuid}`, e);
    }
  }
}
