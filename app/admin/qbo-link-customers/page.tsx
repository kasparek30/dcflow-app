// app/admin/qbo-link-customers/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

type DcCustomer = {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  qboCustomerId?: string | null;
  qboDisplayName?: string | null;
};

type QboCustomer = {
  id: string; // doc id = qboCustomerId
  qboCustomerId: string;
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  active?: boolean;
};

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bestQboMatch(dc: DcCustomer, qbos: QboCustomer[]) {
  const dcEmail = norm(dc.email || "");
  const dcPhone = norm((dc.phone || "").replace(/\D/g, ""));
  const dcName = norm(dc.displayName || "");

  if (dcEmail) {
    const emailHit = qbos.find((q) => norm(q.email || "") === dcEmail);
    if (emailHit) return emailHit;
  }

  if (dcPhone) {
    const phoneHit = qbos.find((q) => norm((q.phone || "").replace(/\D/g, "")) === dcPhone);
    if (phoneHit) return phoneHit;
  }

  if (dcName) {
    const nameHit = qbos.find((q) => norm(q.displayName || "") === dcName);
    if (nameHit) return nameHit;

    // contains fallback
    const contains = qbos.find((q) => norm(q.displayName || "").includes(dcName));
    if (contains) return contains;
  }

  return null;
}

export default function QboLinkCustomersPage() {
  const { appUser } = useAuthContext();

  const canUse =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const [loading, setLoading] = useState(true);
  const [dcCustomers, setDcCustomers] = useState<DcCustomer[]>([]);
  const [qboCustomers, setQboCustomers] = useState<QboCustomer[]>([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      setMsg("");

      try {
        const [dcSnap, qboSnap] = await Promise.all([
          getDocs(collection(db, "customers")),
          getDocs(collection(db, "qboCustomers")),
        ]);

        const dc: DcCustomer[] = dcSnap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            displayName: x.customerDisplayName ?? x.displayName ?? "Unnamed Customer",
            email: x.email ?? undefined,
            phone: x.phone ?? undefined,
            qboCustomerId: x.qboCustomerId ?? null,
            qboDisplayName: x.qboDisplayName ?? null,
          };
        });

        const qbo: QboCustomer[] = qboSnap.docs.map((d) => {
          const x = d.data() as any;
          const id = x.qboCustomerId ?? d.id;
          return {
            id: d.id,
            qboCustomerId: String(id),
            displayName: x.displayName ?? "",
            companyName: x.companyName ?? "",
            email: x.email ?? "",
            phone: x.phone ?? "",
            active: typeof x.active === "boolean" ? x.active : true,
          };
        });

        dc.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        qbo.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

        setDcCustomers(dc);
        setQboCustomers(qbo);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filtered = useMemo(() => {
    const s = norm(search);
    if (!s) return dcCustomers;

    return dcCustomers.filter((c) => {
      const blob = norm(`${c.displayName} ${c.email || ""} ${c.phone || ""} ${c.qboCustomerId || ""}`);
      return blob.includes(s);
    });
  }, [dcCustomers, search]);

  async function linkCustomer(dcId: string, qbo: QboCustomer) {
    if (!canUse) return;
    setSavingId(dcId);
    setMsg("");

    try {
      const now = new Date().toISOString();

      await updateDoc(doc(db, "customers", dcId), {
        qboCustomerId: qbo.qboCustomerId,
        qboDisplayName: qbo.displayName || null,
        qboLinkedAt: now,
        qboLinkedByUid: appUser?.uid || null,
      });

      setDcCustomers((prev) =>
        prev.map((c) =>
          c.id === dcId
            ? {
                ...c,
                qboCustomerId: qbo.qboCustomerId,
                qboDisplayName: qbo.displayName || null,
              }
            : c
        )
      );

      setMsg(`✅ Linked DCFlow customer to QBO: ${qbo.displayName} (${qbo.qboCustomerId})`);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed to link customer.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profiles" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginBottom: "10px" }}>
          QBO Link Customers
        </h1>

        <p style={{ color: "#666", fontSize: "13px", maxWidth: "900px" }}>
          Link DCFlow customers to QuickBooks customers by storing <strong>qboCustomerId</strong> on the DCFlow customer
          doc. This is required for “Create Invoice” to be reliable.
        </p>

        {!canUse ? (
          <p style={{ color: "red" }}>
            You do not have access to this tool. (Admin/Manager/Dispatcher only)
          </p>
        ) : null}

        <div style={{ marginTop: "12px", maxWidth: "900px" }}>
          <label style={{ fontWeight: 800 }}>Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, or qboCustomerId..."
            style={{
              display: "block",
              width: "100%",
              marginTop: "6px",
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
        </div>

        {loading ? <p style={{ marginTop: "14px" }}>Loading customers...</p> : null}
        {error ? <p style={{ marginTop: "14px", color: "red" }}>{error}</p> : null}
        {msg ? <p style={{ marginTop: "14px", color: msg.startsWith("✅") ? "green" : "red" }}>{msg}</p> : null}

        {!loading && !error ? (
          <div style={{ marginTop: "14px", maxWidth: "980px", display: "grid", gap: "10px" }}>
            {filtered.map((c) => {
              const linked = Boolean(c.qboCustomerId);
              const suggested = linked ? null : bestQboMatch(c, qboCustomers);

              return (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    padding: "12px",
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{c.displayName}</div>
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                    DCFlow Customer ID: {c.id}
                  </div>

                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                    Email: {c.email || "—"} • Phone: {c.phone || "—"}
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "12px" }}>
                    {linked ? (
                      <div style={{ color: "green", fontWeight: 800 }}>
                        ✅ Linked to QBO: {c.qboDisplayName || "Customer"} ({c.qboCustomerId})
                      </div>
                    ) : suggested ? (
                      <div style={{ color: "#555" }}>
                        Suggested QBO match: <strong>{suggested.displayName}</strong>{" "}
                        <span style={{ color: "#777" }}>
                          ({suggested.qboCustomerId}) • {suggested.email || "no email"}
                        </span>
                      </div>
                    ) : (
                      <div style={{ color: "#777" }}>
                        No suggestion found. (Run sync / check name/email/phone.)
                      </div>
                    )}
                  </div>

                  {!linked && suggested ? (
                    <button
                      type="button"
                      onClick={() => linkCustomer(c.id, suggested)}
                      disabled={!canUse || savingId === c.id}
                      style={{
                        marginTop: "10px",
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: canUse ? "pointer" : "not-allowed",
                        fontWeight: 900,
                      }}
                    >
                      {savingId === c.id ? "Linking..." : "Link Suggested QBO Customer"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}
