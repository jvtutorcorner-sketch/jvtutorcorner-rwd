#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function tryMakeDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    const testFile = path.join(dir, '.writable_test');
    await fs.writeFile(testFile, 'ok', 'utf8');
    await fs.unlink(testFile);
    return true;
  } catch (e) {
    return false;
  }
}

function resolveLocalDataDir() {
  const candidates = [];
  if (process.env.LOCAL_DATA_DIR) candidates.push(path.resolve(process.env.LOCAL_DATA_DIR));
  candidates.push(path.resolve(process.cwd(), '.local_data'));
  candidates.push(path.join(os.tmpdir(), 'jvtutorcorner', '.local_data'));
  return (async () => {
    for (const d of candidates) {
      if (await tryMakeDir(d)) return d;
    }
    return path.resolve(process.cwd(), '.local_data');
  })();
}

async function walkForPages(dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (e) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkForPages(full, out);
    else if (e.isFile()) {
      if (/^page\.(t|j)sx?$/.test(e.name)) out.push(full);
    }
  }
  return out;
}

function makeRouteFromFile(appRoot, file) {
  let rel = path.relative(appRoot, file).replace(/\\/g, '/');
  rel = rel.replace(/\/page\.(t|j)sx?$/, '');
  const routePath = '/' + (rel === '' ? '' : rel);
  // normalize without regex replace chain: split and rejoin
  const parts = routePath.split('/').filter(Boolean);
  const cleanPath = parts.length === 0 ? '/' : '/' + parts.join('/');
  return cleanPath;
}

async function main() {
  const appRoot = path.resolve(process.cwd(), 'app');
  const pages = await walkForPages(appRoot);
  const roles = [
    { id: 'admin', name: 'Admin' },
    { id: 'teacher', name: 'Teacher' },
    { id: 'student', name: 'Student' }
  ];
  const seen = new Set();
  const pageConfigs = [];
  // try to read existing settings to preserve labels
  let existing = {};
  try {
    const data = await fs.readFile(path.join(await resolveLocalDataDir(), 'admin_settings.json'), 'utf8');
    existing = JSON.parse(data || '{}');
  } catch (e) {
    existing = {};
  }
  const existingMap = new Map();
  (existing.pageConfigs || []).forEach(p => {
    const key = p.path || p.id;
    if (key) existingMap.set(key, p.label);
  });

  pages.forEach(p => {
    const route = makeRouteFromFile(appRoot, p);
    if (seen.has(route)) return;
    seen.add(route);
    const label = existingMap.get(route) || (route === '/' ? '首頁' : decodeURIComponent(route.replace(/\//g, ' ').trim()));
    const permissions = roles.map(r => ({
      roleId: r.id,
      roleName: r.name,
      menuVisible: !route.startsWith('/admin'),
      dropdownVisible: !route.startsWith('/admin'),
      pageVisible: true
    }));
    pageConfigs.push({ id: route, path: route, label, permissions });
  });

  const dir = await resolveLocalDataDir();
  const file = path.join(dir, 'admin_settings.json');
  const settings = {
    roles: [
      { id: 'admin', name: 'Admin', description: '管理员', isActive: true },
      { id: 'teacher', name: 'Teacher', description: '教师', isActive: true },
      { id: 'student', name: 'Student', description: '学生', isActive: true }
    ],
    defaultPlan: 'basic',
    pageConfigs: pageConfigs
  };

  // generate legacy pageVisibility
  const pageVisibility = {};
  settings.pageConfigs.forEach(pc => {
    const entry = { label: pc.label || pc.path, menu: {}, dropdown: {}, page: {} };
    (pc.permissions || []).forEach(perm => {
      const roleKey = (perm.roleId || '').toLowerCase();
      entry.menu[roleKey] = !!perm.menuVisible;
      entry.dropdown[roleKey] = !!perm.dropdownVisible;
      entry.page[roleKey] = !!perm.pageVisible;
    });
    pageVisibility[pc.path] = entry;
  });
  settings.pageVisibility = pageVisibility;

  await fs.writeFile(file, JSON.stringify(settings, null, 2), 'utf8');
  console.log('Wrote', file, 'with', settings.pageConfigs.length, 'pages');
}

main().catch(err => { console.error(err); process.exit(1); });
