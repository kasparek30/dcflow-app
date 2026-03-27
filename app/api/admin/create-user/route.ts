// app/api/admin/create-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  adminAuth,
  adminFirestore,
} from "../../../../src/lib/firebase-admin";

type RoleOption =
  | "admin"
  | "manager"
  | "dispatcher"
  | "billing"
  | "office_display"
  | "technician"
  | "helper"
  | "apprentice";

function isAllowedRole(role: string): role is RoleOption {
  return [
    "admin",
    "manager",
    "dispatcher",
    "billing",
    "office_display",
    "technician",
    "helper",
    "apprentice",
  ].includes(role);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const requesterUid = decoded.uid;

    const requesterSnap = await adminFirestore
      .collection("users")
      .doc(requesterUid)
      .get();

    if (!requesterSnap.exists) {
      return NextResponse.json(
        { error: "Requesting admin user record not found." },
        { status: 403 }
      );
    }

    const requester = requesterSnap.data() as any;
    if (String(requester.role || "").toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "Only admins can create users." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const displayName = String(body.displayName || "").trim();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "")
      .trim()
      .toLowerCase();
    const active = Boolean(body.active);

    const laborRoleTypeRaw = body.laborRoleType;
    const laborRoleType =
      laborRoleTypeRaw == null || String(laborRoleTypeRaw).trim() === ""
        ? null
        : String(laborRoleTypeRaw).trim();

    const preferredTechnicianIdRaw = body.preferredTechnicianId;
    const preferredTechnicianId =
      preferredTechnicianIdRaw == null ||
      String(preferredTechnicianIdRaw).trim() === ""
        ? null
        : String(preferredTechnicianIdRaw).trim();

    if (!displayName) {
      return NextResponse.json(
        { error: "Display name is required." },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    if (!isAllowedRole(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    let preferredTechnicianName: string | null = null;

    if (role === "helper" || role === "apprentice") {
      if (!preferredTechnicianId) {
        return NextResponse.json(
          { error: "Helpers and apprentices must have a default technician." },
          { status: 400 }
        );
      }

      const techSnap = await adminFirestore
        .collection("users")
        .doc(preferredTechnicianId)
        .get();

      if (!techSnap.exists) {
        return NextResponse.json(
          { error: "Selected technician does not exist." },
          { status: 400 }
        );
      }

      const techData = techSnap.data() as any;
      if (String(techData.role || "").toLowerCase() !== "technician") {
        return NextResponse.json(
          { error: "Preferred technician must be a technician." },
          { status: 400 }
        );
      }

      preferredTechnicianName = String(
        techData.displayName || "Technician"
      );
    }

    const existingByEmail = await adminAuth
      .getUserByEmail(email)
      .then((u) => u)
      .catch(() => null);

    if (existingByEmail) {
      return NextResponse.json(
        { error: "A Firebase Auth user with that email already exists." },
        { status: 400 }
      );
    }

    const created = await adminAuth.createUser({
      email,
      password,
      displayName,
      disabled: !active,
    });

    const now = new Date().toISOString();

    await adminFirestore
      .collection("users")
      .doc(created.uid)
      .set(
        {
          uid: created.uid,
          displayName,
          email,
          role,
          active,
          laborRoleType,
          preferredTechnicianId,
          preferredTechnicianName,
          holidayEligible:
            role === "technician" ||
            role === "helper" ||
            role === "apprentice",
          defaultDailyHolidayHours:
            role === "technician" ||
            role === "helper" ||
            role === "apprentice"
              ? 8
              : null,
          createdAt: now,
          createdByUid: requesterUid,
          updatedAt: now,
          updatedByUid: requesterUid,
        },
        { merge: true }
      );

    return NextResponse.json({
      ok: true,
      uid: created.uid,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to create user.",
      },
      { status: 500 }
    );
  }
}