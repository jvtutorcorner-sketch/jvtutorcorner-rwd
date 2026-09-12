import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { verifyOrderToken } from '@/lib/ticket/ticketToken';
import LocalDate from '@/components/LocalDate';
import TicketQrCode from '@/components/TicketQrCode';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

function StateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="page">
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{title}</h1>
        <p style={{ color: '#6b7280' }}>{message}</p>
      </div>
    </div>
  );
}


export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const orderId = verifyOrderToken(token);
  if (!orderId) {
    return <StateCard title="無效的票券連結" message="這個報到連結無法辨識，請確認信件中的連結是否完整，或聯絡客服協助。" />;
  }

  let order: any = null;
  try {
    const orderRes = await ddbDocClient.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } }));
    order = orderRes.Item || null;
  } catch (e) {
    console.error('[TicketPage] order lookup failed:', e);
    return <StateCard title="暫時無法載入票券" message="系統暫時發生問題，請稍後再試。" />;
  }

  if (!order) {
    return <StateCard title="查無此訂單" message="這張票券對應的訂單不存在，可能已被取消。" />;
  }
  if (!['PAID', 'ACTIVE'].includes(order.status)) {
    return <StateCard title="票券尚未生效" message="此訂單尚未完成付款程序，請完成報名後再回來查看票券。" />;
  }

  let course: any = null;
  if (order.courseId) {
    try {
      const courseRes = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: order.courseId } }));
      course = courseRes.Item || null;
      if (course?.teacherId) {
        const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: course.teacherId } }));
        if (tRes.Item?.name) course.teacherName = tRes.Item.name;
      }
    } catch (e) {
      console.warn('[TicketPage] course/teacher lookup failed:', e);
    }
  }

  const courseTitle = course?.title || order.courseTitle || '課程';
  const teacherName = course?.teacherName || '';
  const startTime = order.startTime || course?.startTime || '';

  return (
    <div className="page">
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            background: 'linear-gradient(135deg,#1e40af 0%,#3b82f6 100%)',
            padding: '24px 28px',
            color: '#fff',
          }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>報到票券</p>
            <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700 }}>{courseTitle}</h1>
          </div>

          <div style={{ padding: 28 }}>
            <TicketQrCode value={`${resolveTicketBaseUrl()}/ticket/${token}`} />

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: '#374151' }}>
              {teacherName && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>授課老師</span>
                  <span>{teacherName}</span>
                </div>
              )}
              {startTime && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>上課時間</span>
                  <span><LocalDate value={startTime} mode="custom" options={{ dateStyle: 'medium', timeStyle: 'short' }} fallback="TBD" /></span>
                </div>
              )}
              {typeof order.totalSessions === 'number' && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>剩餘堂數</span>
                  <span>{order.remainingSessions ?? order.totalSessions} / {order.totalSessions}</span>
                </div>
              )}
            </div>

            <p style={{ marginTop: 20, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
              請於上課地點出示此 QR Code，供助教掃描完成報到。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveTicketBaseUrl(): string {
  const override = process.env.EMAIL_LINK_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, '');
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://www.jvtutorcorner.com';
}
