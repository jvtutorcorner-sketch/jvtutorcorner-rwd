const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');

// append logs to e2e/e2e.log for post-run inspection
const logPath = 'e2e/e2e.log';
try { fs.mkdirSync('e2e', { recursive: true }); } catch (e) {}
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => {
  try { logStream.write(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'); } catch (e) {}
  _origLog(...args);
};
console.error = (...args) => {
  try { logStream.write('[ERR] ' + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'); } catch (e) {}
  _origErr(...args);
};

async function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(url, (r) => {
          res();
          req.destroy();
        });
        req.on('error', rej);
        req.setTimeout(2000, () => { req.destroy(); rej(new Error('timeout')); });
      });
      return true;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

(async () => {
  const base = 'http://localhost:3000';
  const courseId = 'c1';
  const teacherUrl = `${base}/classroom?courseId=${courseId}&role=teacher`;
  const studentUrl = `${base}/classroom?courseId=${courseId}&role=student`;
  console.log('Waiting for server at', base);
  const ok = await waitForServer(base + '/');
  if (!ok) {
    console.error('Server did not become available within timeout');
    process.exit(4);
  }

  const headless = process.env.E2E_HEADLESS !== '0';
  // allow optionally passing a fake video file via E2E_FAKE_VIDEO_FILE
  const fakeVideoFile = process.env.E2E_FAKE_VIDEO_FILE || null;
  const fakeAudioFile = process.env.E2E_FAKE_AUDIO_FILE || null;
  const extraArgs = [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ];
  if (fakeVideoFile) extraArgs.push(`--use-file-for-fake-video-capture=${fakeVideoFile}`);
  if (fakeAudioFile) extraArgs.push(`--use-file-for-fake-audio-capture=${fakeAudioFile}`);

  console.log('Launching browser, headless=', headless, 'fakeVideoFile=', fakeVideoFile);
  const browser = await chromium.launch({ headless, args: extraArgs });
  try {
    const teacherCtx = await browser.newContext();
    const studentCtx = await browser.newContext();
    // Grant camera+microphone permissions for the app origin so getUserMedia works
    try { await teacherCtx.grantPermissions(['camera', 'microphone']); } catch (e) {}
    try { await studentCtx.grantPermissions(['camera', 'microphone']); } catch (e) {}

    const teacherPage = await teacherCtx.newPage();
    const studentPage = await studentCtx.newPage();

    // Pipe browser console and errors to node stdout for debugging
    const attachDebugging = (page, label) => {
      page.on('console', (msg) => {
        try { console.log(`[${label}] console.${msg.type()} ${msg.text()}`); } catch (e) {}
      });
      page.on('pageerror', (err) => console.error(`[${label}] pageerror:`, err));
      page.on('response', (res) => {
        try {
          const status = res.status();
          if (status >= 400) console.warn(`[${label}] response ${res.url()} => ${status}`);
        } catch (e) {}
      });
    };
    attachDebugging(teacherPage, 'teacher');
    attachDebugging(studentPage, 'student');

    console.log('Navigating teacher...');
    await teacherPage.goto(teacherUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Navigating student...');
    await studentPage.goto(studentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait a moment for scripts to initialize
    await Promise.all([teacherPage.waitForTimeout(1000), studentPage.waitForTimeout(1000)]);

    // Click Join on both pages (try a few selectors)
    const clickJoin = async (page) => {
      const joinSelectors = [
        'button:has-text("Join")',
        'button:has-text("開始上課")',
        'button:has-text("🚀 Join")',
        'button:has-text("Join (開始上課)")'
      ];
      for (const sel of joinSelectors) {
        try {
          const btn = page.locator(sel);
          if (await btn.count()) {
            await btn.first().click({ timeout: 2000 }).catch(() => {});
            return true;
          }
        } catch (e) {}
      }
      // fallback: click first primary button
      try {
        const btn = page.locator('button').first();
        await btn.click({ timeout: 2000 });
        return true;
      } catch (e) {
        return false;
      }
    };

    console.log('Clicking Join on teacher...');
    await clickJoin(teacherPage);
    console.log('Clicking Join on student...');
    await clickJoin(studentPage);

    // Try clicking the troubleshoot button to simulate user gesture unlocking audio
    const clickTroubleshoot = async (page) => {
      try {
        const btn = page.locator('#btn-troubleshoot');
        if (await btn.count()) {
          await btn.first().click({ timeout: 2000 }).catch(() => {});
          console.log('Clicked #btn-troubleshoot on page');
          return true;
        }
      } catch (e) { console.error('clickTroubleshoot error', e); }
      return false;
    };

    // Wait until a remote video element appears/has dimensions before clicking troubleshoot
    const waitForRemoteVideoPresence = async (page, timeout = 15000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const res = await page.evaluate(() => {
            const vids = Array.from(document.querySelectorAll('video'));
            return vids.map(v => ({ w: v.videoWidth, h: v.videoHeight, ready: v.readyState }));
          });
          // require at least two video elements and at least one with non-zero dimensions
          if (res.length >= 2 && res.some(v => v.w && v.w > 0)) return true;
        } catch (e) {
          // page may be navigating; ignore and retry
        }
        await page.waitForTimeout(300);
      }
      return false;
    };

    console.log('Waiting for remote video presence on teacher page before troubleshooting...');
    await waitForRemoteVideoPresence(teacherPage, 15000);
    console.log('Clicking troubleshoot on teacher...');
    await clickTroubleshoot(teacherPage);

    console.log('Waiting for remote video presence on student page before troubleshooting...');
    await waitForRemoteVideoPresence(studentPage, 15000);
    console.log('Clicking troubleshoot on student...');
    await clickTroubleshoot(studentPage);

    // Wait up to 20s for local and remote videos to show play dimensions
    const waitForVideo = async (page, localIndex = 0, remoteIndex = 1) => {
      const start = Date.now();
      while (Date.now() - start < 20000) {
        const res = await page.evaluate(() => {
          const vids = Array.from(document.querySelectorAll('video'));
          return vids.map(v => ({ w: v.videoWidth, h: v.videoHeight, ready: v.readyState }));
        });
        if (res.length >= 2) {
          const localOK = res[localIndex] && res[localIndex].w > 0;
          const remoteOK = res[remoteIndex] && res[remoteIndex].w > 0;
          if (localOK && remoteOK) return { localOK, remoteOK, details: res };
        }
        await page.waitForTimeout(500);
      }
      return { timeout: true };
    };

    // Wait up to 20s for remote audio to start playing (audio elements present and advancing)
    const waitForAudio = async (page, remoteIndex = 0) => {
      const start = Date.now();
      while (Date.now() - start < 20000) {
        try {
          const res = await page.evaluate(() => {
            const auds = Array.from(document.querySelectorAll('audio'));
            return auds.map(a => ({ paused: a.paused, ready: a.readyState, t: a.currentTime }));
          });
          if (res.length > remoteIndex) {
            const r = res[remoteIndex];
            if (r && r.ready >= 3 && r.t > 0) return { ok: true, details: res };
          }
        } catch (e) {
          // page may have navigated or context destroyed; keep trying until timeout
        }
        await page.waitForTimeout(300);
      }
      return { timeout: true };
    };

    // Primary: check window.__agoraAudioPlaying flag set by page when remote audio starts
    const waitForAgoraWindowFlag = async (page, timeout = 20000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const flag = await page.evaluate(() => {
            try { return !!(window && window.__agoraAudioPlaying); } catch (e) { return false; }
          });
          if (flag) return { ok: true, flag: true };
        } catch (e) {}
        await page.waitForTimeout(250);
      }
      return { timeout: true };
    };

    // Fallback: listen to Agora SDK console logs for audio playback hints
    const waitForAudioConsole = async (page) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          page.removeListener('console', onConsole);
          resolve({ timeout: true });
        }, 30000); // Longer timeout for remote audio to start flowing

        const onConsole = (msg) => {
          try {
            const text = String(msg.text()).toLowerCase();
            // Detect a variety of Agora audio playback signatures and related hints
            const patterns = [
              /remoteaudiotrack\.play/, // RemoteAudioTrack.play
              /remote audio track.*play/, // verbose forms
              /audio-element-status.*playing/, // audio-element-status change ... => playing
              /audio-element-status.*play/, // other variants
              /remoteaudiotrack.*onSuccess/, // apiInvoke onSuccess
              /remote audio.*started/, // generic hint
              /audio playback|start audio playback|start audio/, // generic phrases
              /remoteaudio.*playing/,
            ];
            for (const p of patterns) {
              if (p.test(text)) {
                clearTimeout(timeout);
                page.removeListener('console', onConsole);
                resolve({ ok: true, msg: text });
                return;
              }
            }
          } catch (e) {}
        };
        page.on('console', onConsole);
      });
    };

    // Attempt to collect RTCPeerConnection stats by probing window.__agoraClient and scanning window
    const collectPeerConnectionStats = async (page, label) => {
      try {
        const res = await page.evaluate(async () => {
          const out = { foundClient: false, stats: [], errors: [] };
          try {
            const client = window.__agoraClient;
            out.foundClient = !!client;
            const candidates = [];
            if (client) {
              const fields = ['_p2pConnections', '_pc', '_pcs', 'p2pConnections', 'pcMap', '_pcMap'];
                for (const f of fields) {
                  try { if (client && client[f]) candidates.push(client[f]); } catch (e) {}
                }
            }

            const pcs = [];
            const addIfPC = (v) => {
              if (!v) return;
              if (Array.isArray(v)) return v.forEach(addIfPC);
              if (typeof v === 'object') {
                Object.values(v).forEach(addIfPC);
                if (typeof v.getStats === 'function') pcs.push(v);
              }
            };
            addIfPC(candidates);

            // Scan window for objects exposing getStats()
            try {
              for (const k in window) {
                try {
                  const v = window[k];
                  if (v && typeof v.getStats === 'function') pcs.push(v);
                } catch (e) {}
              }
            } catch (e) {}

            // unique
            const unique = Array.from(new Set(pcs));
            for (const pc of unique) {
              try {
                const report = await pc.getStats();
                const arr = [];
                try { report.forEach((r) => arr.push(r)); } catch (e) {
                  for (const k of Object.keys(report)) arr.push(report[k]);
                }
                out.stats.push({ ok: true, entries: arr.slice(0, 200) });
              } catch (e) {
                out.stats.push({ ok: false, error: String(e) });
              }
            }
          } catch (err) {
            out.errors.push(String(err));
          }
          return out;
        });
        console.log(`${label} PC stats:`, JSON.stringify(res));
        return res;
      } catch (e) {
        console.warn('collectPeerConnectionStats error', e);
        return null;
      }
    };

    console.log('Waiting for teacher video...');
    const teacherResult = await waitForVideo(teacherPage, 0, 1);
    console.log('Waiting for student video...');
    const studentResult = await waitForVideo(studentPage, 0, 1);

    console.log('Waiting for teacher audio (window flag first)...');
    let teacherAudio = await waitForAgoraWindowFlag(teacherPage, 20000);
    if (teacherAudio.timeout) {
      console.log('Teacher window flag timed out, trying DOM audio then console fallback');
      teacherAudio = await waitForAudio(teacherPage, 0);
      if (teacherAudio.timeout) teacherAudio = await waitForAudioConsole(teacherPage);
    }

    console.log('Waiting for student audio (window flag first)...');
    let studentAudio = await waitForAgoraWindowFlag(studentPage, 20000);
    if (studentAudio.timeout) {
      console.log('Student window flag timed out, trying DOM audio then console fallback');
      studentAudio = await waitForAudio(studentPage, 0);
      if (studentAudio.timeout) studentAudio = await waitForAudioConsole(studentPage);
    }

    console.log('Teacher audio result:', teacherAudio);
    console.log('Student audio result:', studentAudio);

      // Collect peer connection stats for deeper debugging
      console.log('Collecting peer-connection stats (teacher)...');
      await collectPeerConnectionStats(teacherPage, 'teacher');
      console.log('Collecting peer-connection stats (student)...');
      await collectPeerConnectionStats(studentPage, 'student');

    console.log('Teacher result:', teacherResult);
    console.log('Student result:', studentResult);

    const success = !teacherResult.timeout && !studentResult.timeout && teacherResult.localOK && teacherResult.remoteOK && studentResult.localOK && studentResult.remoteOK && !teacherAudio.timeout && !studentAudio.timeout && teacherAudio.ok && studentAudio.ok;

    console.log('E2E video test', success ? 'PASSED' : 'FAILED');
    await teacherCtx.close();
    await studentCtx.close();
    await browser.close();
    process.exit(success ? 0 : 2);
  } catch (err) {
    console.error('E2E error', err);
    try { await browser.close(); } catch (e) {}
    process.exit(3);
  }
})();
