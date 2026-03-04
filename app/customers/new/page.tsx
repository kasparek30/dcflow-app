"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

export default function NewCustomerPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [displayName, setDisplayName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [email, setEmail] = useState("");
  const [billingAddressLine1, setBillingAddressLine1] = useState("");
  const [billingAddressLine2, setBillingAddressLine2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const docRef = await addDoc(collection(db, "customers"), {
        source: "dcflow",
        quickbooksCustomerId: null,

        displayName: displayName.trim(),
        phonePrimary: phonePrimary.trim(),
        phoneSecondary: phoneSecondary.trim() || null,
        email: email.trim() || null,

        billingAddressLine1: billingAddressLine1.trim(),
        billingAddressLine2: billingAddressLine2.trim() || null,
        billingCity: billingCity.trim(),
        billingState: billingState.trim(),
        billingPostalCode: billingPostalCode.trim(),

        notes: notes.trim() || null,
        active: true,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push(`/customers/${docRef.id}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create customer.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Customer">
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          New Customer
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "12px",
            maxWidth: "700px",
          }}
        >
          <div>
            <label>Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Primary Phone</label>
            <input
              value={phonePrimary}
              onChange={(e) => setPhonePrimary(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Secondary Phone</label>
            <input
              value={phoneSecondary}
              onChange={(e) => setPhoneSecondary(e.target.value)}
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Billing Address Line 1</label>
            <input
              value={billingAddressLine1}
              onChange={(e) => setBillingAddressLine1(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Billing Address Line 2</label>
            <input
              value={billingAddressLine2}
              onChange={(e) => setBillingAddressLine2(e.target.value)}
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>City</label>
            <input
              value={billingCity}
              onChange={(e) => setBillingCity(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>State</label>
            <input
              value={billingState}
              onChange={(e) => setBillingState(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Postal Code</label>
            <input
              value={billingPostalCode}
              onChange={(e) => setBillingPostalCode(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          <div>
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
            />
          </div>

          {error ? (
            <p style={{ color: "red" }}>{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 16px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              width: "fit-content",
            }}
          >
            {saving ? "Saving..." : "Create Customer"}
          </button>
        </form>
      </AppShell>
    </ProtectedPage>
  );
}