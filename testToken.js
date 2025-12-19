(async () => {
  const port = process.env.PORT || process.argv[2] || '3000';
  const host = process.env.HOST || 'localhost';
  const channel = process.env.CHANNEL || 'test';
  const uid = process.env.UID || '123';
  const url = `http://${host}:${port}/api/agora/token?channelName=${encodeURIComponent(channel)}&uid=${encodeURIComponent(uid)}`;
  console.log('Requesting', url);
  try {
    const res = await fetch(url);
    console.log('status', res.status);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Response text:', text);
    }
  } catch (err) {
    console.error('Request failed:', err.message || err);
    process.exit(1);
  }
})();
