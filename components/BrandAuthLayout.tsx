// components/BrandAuthLayout.tsx
"use client";

import Image from "next/image";
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
};

export default function BrandAuthLayout({
  children,
  title = "Sign in",
  subtitle = "DCFlow • Modern Utility for field operations",
}: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px 14px",
        background: "#070A0F",
        overflow: "hidden",
        position: "relative",
      }}
    >
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
          {/* Logo + header */}
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                justifyContent: "center",
                paddingTop: 6,
              }}
            >
              {/* Put your logo in /public/brand/dcflow-logo.png */}
              <Image
                src="/brand/dcflow-logo.png"
                alt="DCFlow"
                width={220}
                height={72}
                priority
                style={{ height: "auto", width: "min(240px, 68vw)" }}
              />
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 950,
                  color: "white",
                  letterSpacing: "-0.2px",
                }}
              >
                {title}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                {subtitle}
              </div>
            </div>
          </div>

          {/* Content slot (your existing login form goes here) */}
          <div style={{ marginTop: 16 }}>{children}</div>

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
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: "rgba(255,30,40,0.95)", // red accent
                    boxShadow: "0 0 0 4px rgba(255,30,40,0.14)",
                  }}
                />
                Modern Utility
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tiny bottom hint */}
      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          textAlign: "center",
          maxWidth: 560,
        }}
      >
        Built for technicians, dispatch, and payroll — fast, clean, and reliable.
      </div>
    </div>
  );
}