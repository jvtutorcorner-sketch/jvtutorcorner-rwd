import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/classroom/',
        '/dashboard/',
        '/profile/',
        '/orders/',
        '/enrollments/',
        '/my-courses/',
        '/student_courses/',
        '/teacher_courses/',
        '/redeem/',
        '/settings/',
        '/add-app/',
        '/apps/',
        '/workflows/',
        '/checkDevices/',
        '/auth/',
        '/teacher-escrow/',
        '/courses_manage/',
        '/cyberbiz-affiliate-report/',
        '/ecpay/',
        '/stripe/',
        '/paypal/',
        '/medicine-survey-settings/',
        '/product-scan/',
        '/test-phase1/',
        '/questionnaire/',
        '/calendar/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
