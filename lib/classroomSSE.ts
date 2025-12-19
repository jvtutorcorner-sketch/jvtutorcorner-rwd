type SendFn = (payload: any) => void;

const clients = new Map<string, Set<SendFn>>();

export function registerClient(uuid: string, send: SendFn) {
  console.log(`[SSE] registerClient`);
  let set = clients.get(uuid);
  if (!set) {
    set = new Set();
    clients.set(uuid, set);
  }
  set.add(send);
  console.log(`[SSE] registered client, total clients: ${set.size}`);
  const clientSet = set;
  return () => {
    console.log(`[SSE] unregistering client`);
    clientSet.delete(send);
    if (clientSet.size === 0) {
      clients.delete(uuid);
      console.log(`[SSE] no more clients, removed from map`);
    }
  };
}

export function broadcast(uuid: string, payload: any) {
  const set = clients.get(uuid);
  if (!set) {
    console.log(`[SSE] broadcast no-clients`);
    return;
  }
  try {
    const preview = typeof payload === 'string' ? payload : (JSON.stringify(payload) || '').slice(0, 200);
    console.log(`[SSE] broadcasting to ${set.size} client(s) payload=${preview}`);
  } catch (e) {
    console.log(`[SSE] broadcasting to ${set.size} client(s)`);
  }
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (e) {
      console.warn(`[SSE] client send error`, e);
    }
  }
}
