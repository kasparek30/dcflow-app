// app/login/page.tsx

"use client";

import Image from "next/image";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../src/lib/firebase";

type AppUser = {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  active: boolean;
};

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function WaterLoading() {
  // Droplet + subtle wave line
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {/* Droplet */}
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: "999px",
          position: "relative",
          display: "inline-block",
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.22)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 10,
            height: 10,
            transform: "translate(-50%, -50%) rotate(45deg)",
            borderRadius: 3,
            background:
              "linear-gradient(180deg, rgba(120,220,255,1) 0%, rgba(0,150,255,1) 70%)",
            boxShadow: "0 10px 18px rgba(0,140,255,0.25)",
            animation: "dcflow_drop 900ms ease-in-out infinite",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: -18,
            background:
              "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.40), rgba(255,255,255,0) 55%)",
            opacity: 0.55,
            animation: "dcflow_glint 1200ms ease-in-out infinite",
          }}
        />
      </span>

      {/* Wave line */}
      <span
        aria-hidden
        style={{
          width: 44,
          height: 10,
          borderRadius: 999,
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(0,0,0,0.18)",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,150,255,0) 0%, rgba(120,220,255,0.75) 40%, rgba(0,150,255,0) 80%)",
            transform: "translateX(-70%)",
            animation: "dcflow_wave 900ms ease-in-out infinite",
          }}
        />
      </span>
    </span>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        setError("No matching DCFlow user profile found.");
        setLoading(false);
        return;
      }

      const appUser = snap.data() as AppUser;

      if (!appUser.active) {
        setError("Your account is inactive.");
        setLoading(false);
        return;
      }

      if (appUser.role === "technician") {
        router.push("/technician");
        return;
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(safeTrim(email)) && Boolean(safeTrim(password)) && !loading;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
padding: "calc(env(safe-area-inset-top) + 24px) 14px 24px",
        background: "#070A0F",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Keyframes */}
      <style>{`
        @keyframes dcflow_wave {
          0% { transform: translateX(-80%); opacity: 0.35; }
          50% { opacity: 1; }
          100% { transform: translateX(120%); opacity: 0.35; }
        }
        @keyframes dcflow_drop {
          0% { transform: translate(-50%, -50%) rotate(45deg) scale(0.92); }
          50% { transform: translate(-50%, -52%) rotate(45deg) scale(1.05); }
          100% { transform: translate(-50%, -50%) rotate(45deg) scale(0.92); }
        }
        @keyframes dcflow_glint {
          0% { opacity: 0.25; transform: translateY(0px); }
          50% { opacity: 0.6; transform: translateY(-1px); }
          100% { opacity: 0.25; transform: translateY(0px); }
        }
      `}</style>

      {/* Background glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 520px at 50% 22%, rgba(0,140,255,0.32) 0%, rgba(0,140,255,0.06) 45%, rgba(0,0,0,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Secondary glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: "-260px",
          bottom: "-260px",
          width: "560px",
          height: "560px",
          borderRadius: 9999,
          background:
            "radial-gradient(circle at 30% 30%, rgba(0,210,255,0.22), rgba(0,0,0,0) 62%)",
          filter: "blur(2px)",
          pointerEvents: "none",
        }}
      />

      {/* Subtle grid */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(closest-side at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0))",
          opacity: 0.55,
          pointerEvents: "none",
        }}
      />

      {/* Card */}
      <div
        style={{
          width: "min(520px, 100%)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          overflow: "hidden",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            height: 4,
            background:
              "linear-gradient(90deg, rgba(0,150,255,1) 0%, rgba(120,220,255,1) 45%, rgba(255,30,40,1) 100%)",
          }}
        />

        <div style={{ padding: 18 }}>
          {/* Logo */}
          <div style={{ display: "grid", placeItems: "center", paddingTop: 6 }}>
            <Image
              src="/brand/dcflow-logo.png"
              alt="DCFlow"
              width={260}
              height={84}
              priority
              style={{
                width: "min(280px, 72vw)",
                height: "auto",
                filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.35))",
              }}
            />
          </div>

          {/* Header */}
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 950,
                color: "white",
                letterSpacing: "-0.2px",
              }}
            >
              Sign in to DCFlow
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              Primary production candidate • secure access
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@company.com"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.26)",
                  color: "white",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.78)" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.26)",
                  color: "white",
                  outline: "none",
                }}
              />
            </div>

            {error ? (
              <div
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,30,40,0.30)",
                  background: "rgba(255,30,40,0.10)",
                  padding: "10px 12px",
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(0,150,255,0.45)",
                background: !canSubmit
                  ? "rgba(255,255,255,0.10)"
                  : "linear-gradient(90deg, rgba(0,150,255,1) 0%, rgba(120,220,255,1) 55%, rgba(0,150,255,1) 100%)",
                color: !canSubmit ? "rgba(255,255,255,0.65)" : "#061018",
                fontWeight: 950,
                cursor: !canSubmit ? "not-allowed" : "pointer",
                boxShadow: !canSubmit ? "none" : "0 16px 30px rgba(0,140,255,0.18)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* subtle animated shimmer while loading */}
              {loading ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0) 80%)",
                    transform: "translateX(-90%)",
                    animation: "dcflow_wave 900ms ease-in-out infinite",
                    opacity: 0.55,
                  }}
                />
              ) : null}

              <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {loading ? <WaterLoading /> : null}
                {loading ? "Signing in..." : "Sign In"}
              </span>
            </button>

            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
              Need access? Ask an admin to create your DCFlow user profile.
            </div>
          </form>

          {/* Footer */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              color: "rgba(255,255,255,0.62)",
              fontSize: 12,
            }}
          >
            <div>© {new Date().getFullYear()} Daniel Cernoch Plumbing</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: "rgba(255,30,40,0.95)",
                  boxShadow: "0 0 0 4px rgba(255,30,40,0.14)",
                }}
              />
              Modern Utility
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}