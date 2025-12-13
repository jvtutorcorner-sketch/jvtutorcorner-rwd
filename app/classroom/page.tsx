// Server wrapper page for classroom — loads client component on the client only
import React from 'react';
import ClientClassroom from './ClientClassroom';

export default function Page() {
  return <ClientClassroom />;
}

export const dynamic = 'force-dynamic';
