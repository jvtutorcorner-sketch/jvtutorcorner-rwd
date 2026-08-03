import OrganizationsManager from '@/components/OrganizationsManager';

export const metadata = {
  title: 'Admin - Organizations',
};

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1>🏢 企業組織管理</h1>
      <p>管理 B2B 企業組織、部門結構、成員與授權席次。</p>
      <OrganizationsManager />
    </main>
  );
}
