import type { Metadata } from 'next';
import { listPublishedCourses, type CourseRecord } from '@/app/courses/_data';
import { listPublicTeachers, type TeacherRecord } from '@/app/teachers/_data';
import { pageOpenGraph } from '@/lib/seo';
import { getCarouselImages } from '@/lib/carousel-db';
import { getHomepageSettings } from '@/lib/homepageSettingsService';
import ClientHomePage from './ClientHomePage';

// Server Component。首頁內容以真實課程/老師為主，可短期快取。
export const revalidate = 300; // 5 分鐘

const HOME_META_TITLE = '線上老師 × 課程 × 即時互動教學';
const HOME_META_DESCRIPTION =
  '在 JV Tutor Corner 找到適合你的老師，透過視訊與線上白板即時互動學習。瀏覽課程與師資，用點數彈性上課，隨時隨地開始你的學習之旅。';

export const metadata: Metadata = {
  title: HOME_META_TITLE,
  description: HOME_META_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: pageOpenGraph({ title: HOME_META_TITLE, description: HOME_META_DESCRIPTION, url: '/' }),
};

const HOT_COURSES_COUNT = 6;
const FEATURED_TEACHERS_COUNT = 6;
const MAX_CATEGORIES = 8;

/** 課程排序鍵：優先真實報名人數，其次建立/上架時間。 */
function courseRecency(c: CourseRecord): number {
  const raw = c.createdAt || c.updatedAt || c.startDate || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export default async function HomePage() {
  const [courses, teachers, carouselImages, homepageSettings] = await Promise.all([
    listPublishedCourses(),
    listPublicTeachers(),
    getCarouselImages(),
    getHomepageSettings(),
  ]);

  // 熱門課程：有人報名 → 依報名數；全為 0 → 依最新上架，並改用「最新課程」標題
  const totalEnrolled = courses.reduce(
    (sum, c) => sum + (typeof c.seatsOccupied === 'number' ? c.seatsOccupied : 0),
    0
  );
  const coursesHeading: 'popular' | 'latest' = totalEnrolled > 0 ? 'popular' : 'latest';

  const sortedCourses = [...courses].sort((a, b) => {
    if (coursesHeading === 'popular') {
      const diff = (b.seatsOccupied || 0) - (a.seatsOccupied || 0);
      if (diff !== 0) return diff;
    }
    return courseRecency(b) - courseRecency(a);
  });
  const hotCourses = sortedCourses.slice(0, HOT_COURSES_COUNT);

  // 精選老師：需有簡介或科目（避免展示註冊即建立的空白老師卡）
  const featuredTeachers = teachers
    .filter((tch: TeacherRecord) => {
      const hasIntro = typeof tch.intro === 'string' && tch.intro.trim().length > 0;
      const hasSubjects = Array.isArray(tch.subjects) && tch.subjects.length > 0;
      return hasIntro || hasSubjects;
    })
    .slice(0, FEATURED_TEACHERS_COUNT);

  // 分類 chip：由真實上架課程的 subject 動態產生（依課程數排序）
  const categoryCounts = new Map<string, number>();
  for (const c of courses) {
    const subject = String(c.subject || '').trim();
    if (!subject) continue;
    categoryCounts.set(subject, (categoryCounts.get(subject) || 0) + 1);
  }
  const categories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORIES)
    .map(([subject, count]) => ({ subject, count }));

  return (
    <ClientHomePage
      courses={hotCourses}
      teachers={featuredTeachers}
      categories={categories}
      coursesHeading={coursesHeading}
      initialCarouselImages={carouselImages.map((img) => img.url)}
      showRecommendations={homepageSettings.showRecommendations}
    />
  );
}
