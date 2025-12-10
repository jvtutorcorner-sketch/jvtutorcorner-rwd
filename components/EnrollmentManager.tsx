"use client";

import { useEffect, useState } from "react";

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
      alert("Order created: " + display);
      await load();
    } catch (err: any) {
      alert("Create order error: " + (err?.message || err));
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
      alert("Payment simulated for order " + orderId);
      await load();
    } catch (err: any) {
      alert("Simulate payment error: " + (err?.message || err));
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

      alert("Enrollment cancelled");
      await load();
    } catch (err: any) {
      alert("Cancel error: " + (err?.message || err));
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

      alert("Refund processed (demo)");
      await load();
    } catch (err: any) {
      alert("Refund error: " + (err?.message || err));
    }
  }

  return (
    <div>
      <h2>我的報名 / 訂單（Demo）</h2>
      {loading && <p>載入中…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && items.length === 0 && <p>目前沒有報名紀錄。</p>}
      <ul>
        {items.map((e) => (
          <li key={e.id} style={{ marginBottom: 12, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            <div><strong>{e.courseTitle}</strong> — {e.name} ({e.email})</div>
            <div>狀態：{e.status}</div>
            <div style={{ marginTop: 8 }}>
              {e.status === "PENDING_PAYMENT" && (
                <>
                  <button onClick={() => createOrder(e)} style={{ marginRight: 8 }}>建立訂單</button>
                  <button onClick={() => simulatePayment(e)} style={{ marginRight: 8 }}>模擬付款</button>
                </>
              )}
              {e.status === "PAID" && (
                <>
                  <button onClick={() => simulatePayment(e)} style={{ marginRight: 8 }}>確認付款（再模擬）</button>
                  <button onClick={() => refundEnrollment(e)} style={{ marginRight: 8 }}>退款</button>
                </>
              )}
              {e.status === "ACTIVE" && (
                <>
                  <span style={{ marginRight: 8 }}>課程已生效</span>
                  <button onClick={() => cancelEnrollment(e)}>取消報名</button>
                </>
              )}
              {(e.status === "CANCELLED" || e.status === "REFUNDED") && (
                <span style={{ color: "gray" }}>已取消 / 已退款</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
