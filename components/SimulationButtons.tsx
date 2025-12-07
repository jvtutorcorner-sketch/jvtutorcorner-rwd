"use client";

import { useState } from "react";

type Result = { message: string; data?: any };

export default function SimulationButtons({
  courseId = "demo-course-001",
  courseTitle = "示範課程",
}: {
  courseId?: string;
  courseTitle?: string;
}) {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  function log(msg: string) {
    setLogs((s) => [new Date().toISOString() + " — " + msg, ...s].slice(0, 50));
  }

  async function createEnrollment(): Promise<Result> {
    log("建立報名中...");
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Demo Student", email: "demo@example.com", courseId, courseTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "create enrollment failed");
      log("建立報名成功: " + data.enrollment?.id);
      return { message: "ok", data };
    } catch (err: any) {
      log("建立報名失敗: " + (err?.message || String(err)));
      return { message: "error", data: err };
    }
  }

  async function createOrder(enrollmentId: string) {
    log("建立訂單中...");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, enrollmentId, amount: 1000, currency: "TWD" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "create order failed");
      log("建立訂單成功: " + data.order?.orderId);
      return { message: "ok", data };
    } catch (err: any) {
      log("建立訂單失敗: " + (err?.message || String(err)));
      return { message: "error", data: err };
    }
  }

  async function simulatePayment(orderId: string) {
    log("模擬付款中 (webhook)...");
    try {
      const res = await fetch("/api/payments/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: "PAID" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "webhook failed");
      log("模擬付款完成: " + orderId);
      return { message: "ok", data };
    } catch (err: any) {
      log("模擬付款失敗: " + (err?.message || String(err)));
      return { message: "error", data: err };
    }
  }

  async function setEnrollmentActive(enrollmentId: string) {
    log("嘗試將報名設為 ACTIVE...");
    try {
      const res = await fetch("/api/enroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: enrollmentId, status: "ACTIVE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "set active failed");
      log("報名已設為 ACTIVE: " + enrollmentId);
      return { message: "ok", data };
    } catch (err: any) {
      log("設為 ACTIVE 失敗: " + (err?.message || String(err)));
      return { message: "error", data: err };
    }
  }

  async function refundOrder(orderId: string) {
    log("執行退款 (將訂單狀態設為 REFUNDED)...");
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REFUNDED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "refund failed");
      log("退款完成 (demo): " + orderId);
      return { message: "ok", data };
    } catch (err: any) {
      log("退款失敗: " + (err?.message || String(err)));
      return { message: "error", data: err };
    }
  }

  async function cancelEnrollment(enrollmentId: string) {
    log("取消報名中...");
    try {
      const res = await fetch("/api/enroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: enrollmentId, status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "cancel failed");
      log("取消報名完成: " + enrollmentId);
      return { message: "ok", data };
    } catch (err: any) {
      log("取消失敗: " + (err?.message || String(err)));
      return { message: "error", data: err };
    }
  }

  async function runFullSimulation() {
    setRunning(true);
    try {
      const eRes = await createEnrollment();
      if (eRes.message !== "ok") return;
      const enrollment = eRes.data?.enrollment;
      if (!enrollment?.id) return;
      const oRes = await createOrder(enrollment.id);
      if (oRes.message !== "ok") return;
      const orderId = oRes.data?.order?.orderId;
      if (!orderId) return;
      await simulatePayment(orderId);
      // ensure enrollment becomes active for demo
      await setEnrollmentActive(enrollment.id);
      log("完整流程模擬結束。");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ border: "1px dashed #ccc", padding: 12, borderRadius: 6, marginBottom: 16 }}>
      <h3>模擬流程按鈕（Demo）</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={runFullSimulation} disabled={running} style={{ background: "#0b74de", color: "white" }}>
          {running ? "執行中..." : "模擬完整流程 (建立報名 → 建立訂單 → 模擬付款 → 啟用)"}
        </button>
        <button
          onClick={async () => {
            setRunning(true);
            const r = await createEnrollment();
            setRunning(false);
            return r;
          }}
          disabled={running}
        >
          建立報名
        </button>
        <button
          onClick={async () => {
            setRunning(true);
            // create an enrollment first to get an id
            const e = await createEnrollment();
            const id = e.data?.enrollment?.id;
            if (id) await createOrder(id);
            setRunning(false);
          }}
          disabled={running}
        >
          建立訂單（需先建立報名）
        </button>
        <button
          onClick={async () => {
            setRunning(true);
            // attempt to find the last order by creating one and paying it
            const e = await createEnrollment();
            const id = e.data?.enrollment?.id;
            if (id) {
              const o = await createOrder(id);
              const orderId = o.data?.order?.orderId;
              if (orderId) await simulatePayment(orderId);
            }
            setRunning(false);
          }}
          disabled={running}
        >
          模擬付款
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>執行紀錄（最近 50 則）</strong>
        <div style={{ maxHeight: 240, overflow: "auto", marginTop: 8, padding: 8, background: "#fafafa" }}>
          {logs.length === 0 && <div style={{ color: "#666" }}>尚無紀錄</div>}
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {logs.map((l, i) => (
              <li key={i} style={{ fontSize: 12, lineHeight: "1.4em" }}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
