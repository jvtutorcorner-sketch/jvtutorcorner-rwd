"use client";

import { useEffect, useState } from "react";
import { useT } from './IntlProvider';

type Enrollment = {
  id: string;
  name: string;
  email: string;
  courseId: string;
  courseTitle: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  orderId?: string;
};

type Order = {
  orderId: string;
  enrollmentId?: string;
  status: string;
  amount?: number;
  currency?: string;
};

export default function EnrollmentManager() {
  const t = useT();
  const [items, setItems] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/enroll");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setItems(data.data || data.enrollments || data); // support multiple shapes
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createOrder(enrollment: Enrollment) {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: enrollment.courseId,
          enrollmentId: enrollment.id,
          amount: 0,
          currency: "TWD",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create order");
      const display = data.order?.orderNumber || data.order?.orderId || '(no id)';
      alert(t('order_created') + ": " + display);
      await load();
    } catch (err: any) {
      alert(t('create_order_error') + ": " + (err?.message || err));
    }
  }

  async function simulatePayment(enrollment: Enrollment) {
    try {
      // find order by scanning backend isn't available; assume orderId stored on enrollment (demo)
      // We'll call payments webhook with enrollment's orderId if present, otherwise try to create a new order first
      let orderId: string | undefined = (enrollment as any).orderId;
      if (!orderId) {
        const createRes = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: enrollment.courseId,
            enrollmentId: enrollment.id,
            amount: 0,
            currency: "TWD",
          }),
        });
        const createData = await createRes.json();
        orderId = createData?.order?.orderId;
      }

      if (!orderId) throw new Error("No orderId available to simulate payment");

      const res = await fetch("/api/payments/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: "PAID" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Payment webhook failed");
      alert(t('payment_simulated') + ": " + orderId);
      await load();
    } catch (err: any) {
      alert(t('simulate_payment_error') + ": " + (err?.message || err));
    }
  }

  async function cancelEnrollment(enrollment: Enrollment) {
    try {
      // If enrollment has orderId, update order to CANCELLED
      const orderId = (enrollment as any).orderId;
      if (orderId) {
        await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        });
      }

      await fetch("/api/enroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: enrollment.id, status: "CANCELLED" }),
      });

      alert(t('enrollment_cancelled'));
      await load();
    } catch (err: any) {
      alert(t('cancel_error') + ": " + (err?.message || err));
    }
  }

  async function refundEnrollment(enrollment: Enrollment) {
    try {
      const orderId = (enrollment as any).orderId;
      if (!orderId) throw new Error("No orderId to refund");

      // mark order refunded
      await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REFUNDED" }),
      });

      // update enrollment
      await fetch("/api/enroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: enrollment.id, status: "REFUNDED" }),
      });

      alert(t('refund_processed'));
      await load();
    } catch (err: any) {
      alert(t('refund_error') + ": " + (err?.message || err));
    }
  }

  return (
    <div>
      <h2>{t('my_enrollments')}</h2>
      {loading && <p>{t('loading')}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && items.length === 0 && <p>{t('no_enrollments')}</p>}
      <ul>
        {items.map((e) => (
          <li key={e.id} style={{ marginBottom: 12, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            <div><strong>{e.courseTitle}</strong> — {e.name} ({e.email})</div>
            <div>{t('status')}: {e.status}</div>
            <div style={{ marginTop: 8 }}>
              {e.status === "PENDING_PAYMENT" && (
                <>
                  <button onClick={() => createOrder(e)} style={{ marginRight: 8 }}>{t('create_order')}</button>
                  <button onClick={() => simulatePayment(e)} style={{ marginRight: 8 }}>{t('simulate_payment')}</button>
                </>
              )}
              {e.status === "PAID" && (
                <>
                  <button onClick={() => simulatePayment(e)} style={{ marginRight: 8 }}>{t('confirm_payment')}</button>
                  <button onClick={() => refundEnrollment(e)} style={{ marginRight: 8 }}>{t('refund')}</button>
                </>
              )}
              {e.status === "ACTIVE" && (
                <>
                  <span style={{ marginRight: 8 }}>{t('course_active')}</span>
                  <button onClick={() => cancelEnrollment(e)}>{t('cancel_enrollment')}</button>
                </>
              )}
              {(e.status === "CANCELLED" || e.status === "REFUNDED") && (
                <span style={{ color: "gray" }}>{t('cancelled_or_refunded')}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
