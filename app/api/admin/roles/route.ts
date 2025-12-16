import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';

type Role = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
};

async function readRoles(): Promise<Role[]> {
  try {
    const ROLES_FILE = await resolveDataFile('admin_roles.json');
    const raw = await fs.readFile(ROLES_FILE, 'utf8');
    const data = JSON.parse(raw);
    let roles = data.roles || [];
    // Merge roles from admin_settings.json if any exist there but missing here
    try {
      const settings = await readSettingsFile();
      if (settings && Array.isArray(settings.roles)) {
        const existingIds = new Set(roles.map((r: Role) => r.id));
        const missing = settings.roles.filter((sr: Role) => !existingIds.has(sr.id));
        if (missing.length) {
          roles = [...roles, ...missing];
          // persist merged roles back to admin_roles.json
          await writeRoles(roles);
        }
      }
    } catch (e) {
      // ignore
    }
    return roles;
  } catch (err) {
    // 返回默认角色
    return [
      { id: 'admin', name: 'Admin', description: '管理员', isActive: true },
      { id: 'teacher', name: 'Teacher', description: '教师', isActive: true },
      { id: 'student', name: 'Student', description: '学生', isActive: true }
    ];
  }
}

async function writeRoles(roles: Role[]) {
  const ROLES_FILE = await resolveDataFile('admin_roles.json');
  await fs.writeFile(ROLES_FILE, JSON.stringify({ roles }, null, 2), 'utf8');
}

async function readSettingsFile() {
  try {
    const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function writeSettingsFile(obj: any) {
  const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export async function GET() {
  try {
    const roles = await readRoles();
    return NextResponse.json({ ok: true, roles });
  } catch (err: any) {
    console.error('[Roles API] GET error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'read error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roles } = body;

    if (!Array.isArray(roles)) {
      return NextResponse.json({ ok: false, error: 'Invalid roles data' }, { status: 400 });
    }

    // 验证角色数据
    for (const role of roles) {
      if (!role.id || !role.name) {
        return NextResponse.json({ ok: false, error: 'Role must have id and name' }, { status: 400 });
      }
    }

    await writeRoles(roles);

    // verify the roles file was actually persisted; if not, attempt a rewrite and fallback
    try {
      const ROLES_FILE = await resolveDataFile('admin_roles.json');
      const checkRaw = await fs.readFile(ROLES_FILE, 'utf8');
      const checkData = JSON.parse(checkRaw || '{}');
      if (!Array.isArray(checkData.roles) || JSON.stringify(checkData.roles) !== JSON.stringify(roles)) {
        // try rewriting once more
        await fs.writeFile(ROLES_FILE, JSON.stringify({ roles }, null, 2), 'utf8');
      }
    } catch (verErr) {
      console.error('[Roles API] persistence verification failed:', verErr);
      // fallback: try to ensure admin_settings.json contains roles so GET endpoints that merge from settings can see them
      try {
        const settings = await readSettingsFile();
        if (settings) {
          settings.roles = roles;
          await writeSettingsFile(settings);
        }
      } catch (fbErr) {
        console.error('[Roles API] fallback write to settings failed:', fbErr);
      }
    }
    // write an audit record so devs can see what was attempted to persist
    try {
      const AUDIT_FILE = await resolveDataFile('admin_roles.last_write.json');
      await fs.writeFile(AUDIT_FILE, JSON.stringify({ timestamp: new Date().toISOString(), roles }, null, 2), 'utf8');
    } catch (auditErr) {
      console.error('[Roles API] failed to write audit file:', auditErr);
    }

    // Also try to sync roles into admin_settings.json so other parts reading settings.roles stay in sync
    try {
      const settings = await readSettingsFile();
      if (settings) {
        settings.roles = roles;
        // Ensure pageConfigs permissions include an entry for each role
        if (Array.isArray(settings.pageConfigs)) {
          settings.pageConfigs = settings.pageConfigs.map((pc: any) => {
            const perms = pc.permissions || [];
            const existingRoleIds = perms.map((p: any) => p.roleId);
            const missing = roles.filter((r: Role) => !existingRoleIds.includes(r.id));
            const added = missing.map(m => ({ roleId: m.id, roleName: m.name, menuVisible: false, dropdownVisible: false, pageVisible: true }));
            return { ...pc, permissions: [...perms, ...added] };
          });
        }
        await writeSettingsFile(settings);
      }
    } catch (syncErr) {
      console.error('[Roles API] failed to sync settings:', syncErr);
    }

    return NextResponse.json({ ok: true, roles });
  } catch (err: any) {
    console.error('[Roles API] POST error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'write error' }, { status: 500 });
  }
}