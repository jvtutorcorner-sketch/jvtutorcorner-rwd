const url = 'http://localhost:3000/api/classroom/stream?uuid=classroom_session_ready_c1';

(async () => {
  try {
    console.log('Connecting to', url);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log('HTTP status:', res.status);
    console.log('--- Response headers ---');
    for (const [k, v] of res.headers) console.log(k + ': ' + v);

    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const { value, done } = await reader.read();
      if (done) console.log('Stream closed immediately');
      else console.log('First chunk:', new TextDecoder().decode(value));
      try { reader.cancel(); } catch (e) {}
    } else if (res.body && typeof res.body.on === 'function') {
      res.body.once('data', (chunk) => {
        console.log('First chunk:', chunk.toString());
        res.body.destroy();
      });
      // give the stream a moment to emit
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      console.log('No readable body available');
    }
  } catch (e) {
    console.error('Connection error:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
})();
