import OrganizationDetailManager from '@/components/OrganizationDetailManager';

export const metadata = {
  title: 'Admin - Organization Detail',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: 24 }}>
      <OrganizationDetailManager orgId={id} />
    </main>
  );
}
