import { NextResponse } from 'next/server';
import { getRoles, saveRoles, type Role } from '@/lib/rolesService';
import { savePagePermissions, getPagePermissions } from '@/lib/pagePermissionsService';
import fs from 'fs/promises';
import resolveDataFile from '@/lib/localData';

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
    console.log('[Roles API] 📖 Loading roles...');
    const roles = await getRoles();
    console.log(`[Roles API] ✅ Loaded ${roles.length} roles`);
    return NextResponse.json({ ok: true, roles });
  } catch (err: any) {
    console.error('[Roles API] ❌ GET error:', err);
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

    // Validate roles data
    for (const role of roles) {
      if (!role.id || !role.name) {
        return NextResponse.json({ ok: false, error: 'Role must have id and name' }, { status: 400 });
      }
    }

    console.log(`[Roles API] 💾 Saving ${roles.length} roles...`);

    // Save to DynamoDB
    const result = await saveRoles(roles);

    if (!result) {
      return NextResponse.json({ ok: false, error: 'Failed to save roles to DynamoDB' }, { status: 500 });
    }

    console.log('[Roles API] ✅ Roles saved to DynamoDB');

    // Sync roles to page permissions in DynamoDB
    try {
      console.log('[Roles API] 🔄 Syncing roles to page permissions...');
      const pageConfigs = await getPagePermissions();

      if (pageConfigs.length > 0) {
        // Update pageConfigs with new roles
        const updatedPageConfigs = pageConfigs.map((pc: any) => {
          const perms = pc.permissions || [];
          const existingRoleIds = perms.map((p: any) => p.roleId);
          const missing = roles.filter((r: Role) => !existingRoleIds.includes(r.id));
          const added = missing.map(m => ({
            roleId: m.id,
            roleName: m.name,
            menuVisible: false,
            dropdownVisible: false,
            pageVisible: false  // 🔑 新角色預設所有權限都是 false
          }));
          return { ...pc, permissions: [...perms, ...added] };
        });

        // Save updated pageConfigs to DynamoDB
        await savePagePermissions(updatedPageConfigs);
        console.log('[Roles API] ✅ Synced roles to page permissions in DynamoDB');
      }
    } catch (syncErr) {
      console.error('[Roles API] ⚠️  Failed to sync to page permissions:', syncErr);
      // Don't fail the request if sync fails
    }

    // Sync roles into admin_settings.json for backward compatibility
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
            const added = missing.map(m => ({
              roleId: m.id,
              roleName: m.name,
              menuVisible: false,
              dropdownVisible: false,
              pageVisible: true
            }));
            return { ...pc, permissions: [...perms, ...added] };
          });
        }

        await writeSettingsFile(settings);
        console.log('[Roles API] ✅ Synced roles to admin_settings.json');
      }
    } catch (syncErr) {
      console.error('[Roles API] ⚠️  Failed to sync settings:', syncErr);
      // Don't fail the request if sync fails
    }

    return NextResponse.json({ ok: true, roles });
  } catch (err: any) {
    console.error('[Roles API] ❌ POST error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'write error' }, { status: 500 });
  }
}