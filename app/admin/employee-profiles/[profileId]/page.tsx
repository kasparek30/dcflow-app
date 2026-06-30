// app/admin/employee-profiles/[profileId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import WorkHistoryRoundedIcon from "@mui/icons-material/WorkHistoryRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CheckroomRoundedIcon from "@mui/icons-material/CheckroomRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type {
  EmployeeProfile,
  EmploymentStatus,
  LaborRole,
  PlumbingLicenseType,
  ShirtSize,
} from "../../../../src/types/employee-profile";

type LicenseInfo = {
  licenseType?: PlumbingLicenseType | null;
  licenseNumber?: string | null;
  issuingState?: string | null;
  expirationDate?: string | null;
  notes?: string | null;
};

type DriverInfo = {
  canDriveCompanyVehicle?: boolean;
  driversLicenseNumber?: string | null;
  driversLicenseState?: string | null;
  driversLicenseExpirationDate?: string | null;
  insuranceApproved?: boolean;
  notes?: string | null;
};

type DcflowUser = {
  uid: string;
  employeeProfileId?: string | null;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;

  // Legacy/fallback profile fields. These were temporarily stored on users/{uid}
  // before employeeProfiles became the workforce source of truth.
  shirtSize?: string | null;
  gearNotes?: string | null;
  licenseInfo?: LicenseInfo | null;
  driverInfo?: DriverInfo | null;
};

type QboEmployeeDoc = {
  id: string;
  qboEmployeeId?: string;
  displayName?: string;
  email?: string;
  hiredDate?: string;
  releasedDate?: string;
  active?: boolean;
};

type PageProps = {
  params: Promise<{ profileId: string }>;
};

const laborRoles: LaborRole[] = [
  "technician",
  "helper",
  "apprentice",
  "dispatcher",
  "billing",
  "admin",
  "manager",
  "other",
];

const employmentStatuses: EmploymentStatus[] = [
  "current",
  "inactive",
  "seasonal",
];

const shirtSizes: ShirtSize[] = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "LT",
  "XLT",
  "2XLT",
  "3XLT",
  "4XLT",
];

const licenseTypes: PlumbingLicenseType[] = [
  "none",
  "apprentice",
  "tradesman",
  "journeyman",
  "master",
  "other",
];

const staffCoverageWorkTypes = [
  { value: "", label: "— None —" },
  { value: "dispatch", label: "Dispatch" },
  { value: "office", label: "Office" },
  { value: "billing", label: "Billing" },
  { value: "shop", label: "Shop" },
  { value: "other", label: "Other" },
];

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(dateIso: string, days: number): string {
  const dt = new Date(`${dateIso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoDate(dt);
}

function titleCase(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleLabel(role?: string | null) {
  const r = String(role || "").toLowerCase();
  if (r === "office_display") return "Office Display";
  if (!r) return "No Role";
  return titleCase(r);
}

function licenseLabel(type?: string | null) {
  if (!type || type === "none") return "No License";
  if (type === "apprentice") return "Apprentice License";
  if (type === "tradesman") return "Tradesman";
  if (type === "journeyman") return "Journeyman";
  if (type === "master") return "Master";
  if (type === "other") return "Other License";
  return titleCase(type);
}

function getLegacyProfileFallbacks(
  profile: EmployeeProfile,
  linkedUser?: DcflowUser | null
) {
  return {
    shirtSize: profile.shirtSize || linkedUser?.shirtSize || "",
    gearNotes: profile.gearNotes || linkedUser?.gearNotes || "",
    licenseInfo: profile.licenseInfo ?? linkedUser?.licenseInfo ?? {},
    driverInfo: profile.driverInfo ?? linkedUser?.driverInfo ?? {},
  };
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
            color: "primary.light",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: "1rem", md: "1.05rem" },
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {title}
          </Typography>

          {subtitle ? (
            <Typography
              sx={{
                mt: 0.4,
                color: "text.secondary",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Stack>
  );
}

export default function EmployeeProfileDetailPage({ params }: PageProps) {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profileId, setProfileId] = useState("");
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [qboEmployees, setQboEmployees] = useState<QboEmployeeDoc[]>([]);
  const [qboLoading, setQboLoading] = useState(true);
  const [showInactiveQbo, setShowInactiveQbo] = useState(false);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [userUid, setUserUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employmentStatus, setEmploymentStatus] =
    useState<EmploymentStatus>("current");
  const [laborRole, setLaborRole] = useState<LaborRole>("technician");
  const [defaultPairedTechUid, setDefaultPairedTechUid] = useState("");
  const [notes, setNotes] = useState("");

  const [showOnSchedule, setShowOnSchedule] = useState(true);
  const [fieldAssignable, setFieldAssignable] = useState(true);
  const [staffCoverageEligible, setStaffCoverageEligible] = useState(false);
  const [defaultStaffCoverageWorkType, setDefaultStaffCoverageWorkType] =
    useState("");

  const [shirtSize, setShirtSize] = useState<ShirtSize | "">("");
  const [gearNotes, setGearNotes] = useState("");

  const [licenseType, setLicenseType] =
    useState<PlumbingLicenseType>("none");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseIssuingState, setLicenseIssuingState] = useState("TX");
  const [licenseExpirationDate, setLicenseExpirationDate] = useState("");
  const [licenseNotes, setLicenseNotes] = useState("");

  const [canDriveCompanyVehicle, setCanDriveCompanyVehicle] = useState(false);
  const [driversLicenseNumber, setDriversLicenseNumber] = useState("");
  const [driversLicenseState, setDriversLicenseState] = useState("TX");
  const [driversLicenseExpirationDate, setDriversLicenseExpirationDate] =
    useState("");
  const [insuranceApproved, setInsuranceApproved] = useState(false);
  const [driverNotes, setDriverNotes] = useState("");

  const [selectedQboId, setSelectedQboId] = useState("");
  const [linkingQbo, setLinkingQbo] = useState(false);
  const [qboLinkError, setQboLinkError] = useState("");
  const [qboLinkMsg, setQboLinkMsg] = useState("");

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === userUid),
    [users, userUid]
  );

  const techUsers = useMemo(() => {
    return users.filter((u) => {
      const role = String(u.role || "").toLowerCase();
      return role === "technician" || role === "manager" || role === "admin";
    });
  }, [users]);

  const filteredQboEmployees = useMemo(() => {
    if (showInactiveQbo) return qboEmployees;
    return qboEmployees.filter((e) => e.active !== false);
  }, [qboEmployees, showInactiveQbo]);

  const selectedQbo = useMemo(() => {
    const target = selectedQboId.trim();
    if (!target) return null;
    return qboEmployees.find((e) => e.id === target) || null;
  }, [selectedQboId, qboEmployees]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError("");
      setSaveMsg("");

      try {
        const resolved = await params;
        const id = resolved.profileId;
        setProfileId(id);

        const ref = doc(db, "employeeProfiles", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Employee profile not found.");
          setLoading(false);
          return;
        }

        const d = snap.data();
        const loadedLicenseInfo = d.licenseInfo ?? {};
        const loadedDriverInfo = d.driverInfo ?? {};

        const item: EmployeeProfile = {
          id: snap.id,
          userUid: d.userUid ?? undefined,
          displayName: d.displayName ?? "",
          email: d.email ?? undefined,
          phone: d.phone ?? undefined,
          employmentStatus: (d.employmentStatus ?? "current") as EmploymentStatus,
          laborRole: (d.laborRole ?? "other") as LaborRole,
          defaultPairedTechUid: d.defaultPairedTechUid ?? undefined,
          showOnSchedule:
            typeof d.showOnSchedule === "boolean" ? d.showOnSchedule : undefined,
          fieldAssignable:
            typeof d.fieldAssignable === "boolean" ? d.fieldAssignable : undefined,
          staffCoverageEligible:
            typeof d.staffCoverageEligible === "boolean"
              ? d.staffCoverageEligible
              : undefined,
          defaultStaffCoverageWorkType:
            d.defaultStaffCoverageWorkType ?? undefined,
          shirtSize: d.shirtSize ?? "",
          gearNotes: d.gearNotes ?? undefined,
          licenseInfo: d.licenseInfo ?? undefined,
          driverInfo: d.driverInfo ?? undefined,
          qboEmployeeId: d.qboEmployeeId ?? undefined,
          qboEmployeeDisplayName: d.qboEmployeeDisplayName ?? undefined,
          qboEmployeeHiredDate: d.qboEmployeeHiredDate ?? undefined,
          ptoEligibilityDate: d.ptoEligibilityDate ?? undefined,
          notes: d.notes ?? undefined,
          createdAt: d.createdAt ?? "",
          updatedAt: d.updatedAt ?? "",
        };

        setProfile(item);

        setUserUid(item.userUid || "");
        setDisplayName(item.displayName);
        setEmail(item.email || "");
        setPhone(item.phone || "");
        setEmploymentStatus(item.employmentStatus);
        setLaborRole(item.laborRole);
        setDefaultPairedTechUid(item.defaultPairedTechUid || "");
        setShowOnSchedule(
          typeof item.showOnSchedule === "boolean" ? item.showOnSchedule : true
        );
        setFieldAssignable(
          typeof item.fieldAssignable === "boolean" ? item.fieldAssignable : true
        );
        setStaffCoverageEligible(
          typeof item.staffCoverageEligible === "boolean"
            ? item.staffCoverageEligible
            : false
        );
        setDefaultStaffCoverageWorkType(
          String(item.defaultStaffCoverageWorkType ?? "")
        );
        setShirtSize((item.shirtSize ?? "") as ShirtSize | "");
        setGearNotes(item.gearNotes || "");
        setLicenseType(
          (loadedLicenseInfo.licenseType ?? "none") as PlumbingLicenseType
        );
        setLicenseNumber(loadedLicenseInfo.licenseNumber ?? "");
        setLicenseIssuingState(loadedLicenseInfo.issuingState ?? "TX");
        setLicenseExpirationDate(loadedLicenseInfo.expirationDate ?? "");
        setLicenseNotes(loadedLicenseInfo.notes ?? "");
        setCanDriveCompanyVehicle(Boolean(loadedDriverInfo.canDriveCompanyVehicle));
        setDriversLicenseNumber(loadedDriverInfo.driversLicenseNumber ?? "");
        setDriversLicenseState(loadedDriverInfo.driversLicenseState ?? "TX");
        setDriversLicenseExpirationDate(
          loadedDriverInfo.driversLicenseExpirationDate ?? ""
        );
        setInsuranceApproved(Boolean(loadedDriverInfo.insuranceApproved));
        setDriverNotes(loadedDriverInfo.notes ?? "");
        setNotes(item.notes || "");

        const qUsers = query(collection(db, "users"), orderBy("displayName"));
        const snapUsers = await getDocs(qUsers);

        const userItems: DcflowUser[] = snapUsers.docs.map((docSnap) => {
          const u = docSnap.data();
          return {
            uid: docSnap.id,
            employeeProfileId: u.employeeProfileId ?? null,
            displayName: u.displayName ?? "",
            email: u.email ?? "",
            role: u.role ?? "",
            active: typeof u.active === "boolean" ? u.active : true,
            shirtSize: u.shirtSize ?? null,
            gearNotes: u.gearNotes ?? null,
            licenseInfo: u.licenseInfo ?? null,
            driverInfo: u.driverInfo ?? null,
          };
        });

        setUsers(userItems);

        const legacyLinkedUser = item.userUid
          ? userItems.find((user) => user.uid === item.userUid)
          : null;
        const fallback = getLegacyProfileFallbacks(item, legacyLinkedUser);
        const fallbackLicenseInfo = fallback.licenseInfo as LicenseInfo;
        const fallbackDriverInfo = fallback.driverInfo as DriverInfo;

        setShirtSize((fallback.shirtSize ?? "") as ShirtSize | "");
        setGearNotes(fallback.gearNotes || "");
        setLicenseType(
          (fallbackLicenseInfo.licenseType ?? "none") as PlumbingLicenseType
        );
        setLicenseNumber(fallbackLicenseInfo.licenseNumber ?? "");
        setLicenseIssuingState(fallbackLicenseInfo.issuingState ?? "TX");
        setLicenseExpirationDate(fallbackLicenseInfo.expirationDate ?? "");
        setLicenseNotes(fallbackLicenseInfo.notes ?? "");
        setCanDriveCompanyVehicle(
          Boolean(fallbackDriverInfo.canDriveCompanyVehicle)
        );
        setDriversLicenseNumber(fallbackDriverInfo.driversLicenseNumber ?? "");
        setDriversLicenseState(fallbackDriverInfo.driversLicenseState ?? "TX");
        setDriversLicenseExpirationDate(
          fallbackDriverInfo.driversLicenseExpirationDate ?? ""
        );
        setInsuranceApproved(Boolean(fallbackDriverInfo.insuranceApproved));
        setDriverNotes(fallbackDriverInfo.notes ?? "");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load employee profile."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [params]);

  useEffect(() => {
    async function loadQboEmployees() {
      setQboLoading(true);
      try {
        const q = query(collection(db, "qboEmployees"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: QboEmployeeDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            qboEmployeeId: d.qboEmployeeId ?? docSnap.id,
            displayName: d.displayName ?? "",
            email: d.email ?? "",
            hiredDate: d.hiredDate ?? "",
            releasedDate: d.releasedDate ?? "",
            active: typeof d.active === "boolean" ? d.active : true,
          };
        });

        setQboEmployees(items);
      } finally {
        setQboLoading(false);
      }
    }

    loadQboEmployees();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    if (!displayName) setDisplayName(selectedUser.displayName || "");
    if (!email) setEmail(selectedUser.email || "");
  }, [selectedUser, displayName, email]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();
      const nextUserUid = userUid.trim() ? userUid.trim() : null;
      const previousUserUid = profile.userUid || null;

      const payload = {
        userUid: nextUserUid,
        displayName: displayName.trim(),
        email: email.trim() ? email.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        employmentStatus,
        laborRole,
        defaultPairedTechUid: defaultPairedTechUid.trim()
          ? defaultPairedTechUid.trim()
          : null,
        showOnSchedule,
        fieldAssignable,
        staffCoverageEligible,
        defaultStaffCoverageWorkType: defaultStaffCoverageWorkType.trim()
          ? defaultStaffCoverageWorkType.trim()
          : null,
        shirtSize: shirtSize || null,
        gearNotes: gearNotes.trim() ? gearNotes.trim() : null,
        licenseInfo: {
          licenseType,
          licenseNumber: licenseNumber.trim() || null,
          issuingState: licenseIssuingState.trim() || null,
          expirationDate: licenseExpirationDate || null,
          notes: licenseNotes.trim() || null,
        },
        driverInfo: {
          canDriveCompanyVehicle,
          driversLicenseNumber: driversLicenseNumber.trim() || null,
          driversLicenseState: driversLicenseState.trim() || null,
          driversLicenseExpirationDate: driversLicenseExpirationDate || null,
          insuranceApproved,
          notes: driverNotes.trim() || null,
        },
        notes: notes.trim() ? notes.trim() : null,
        updatedAt: nowIso,
      };

      if (!payload.displayName) {
        setError("Display name is required.");
        setSaving(false);
        return;
      }

      await updateDoc(doc(db, "employeeProfiles", profile.id), payload);

      if (previousUserUid && previousUserUid !== nextUserUid) {
        await updateDoc(doc(db, "users", previousUserUid), {
          employeeProfileId: null,
          updatedAt: nowIso,
        });
      }

      if (nextUserUid) {
        await updateDoc(doc(db, "users", nextUserUid), {
          employeeProfileId: profile.id,
          displayName: payload.displayName,
          email: payload.email,
          updatedAt: nowIso,
        });
      }

      const updatedProfile: EmployeeProfile = {
        ...profile,
        userUid: payload.userUid || undefined,
        displayName: payload.displayName,
        email: payload.email || undefined,
        phone: payload.phone || undefined,
        employmentStatus: payload.employmentStatus as EmploymentStatus,
        laborRole: payload.laborRole as LaborRole,
        defaultPairedTechUid: payload.defaultPairedTechUid || undefined,
        showOnSchedule: payload.showOnSchedule,
        fieldAssignable: payload.fieldAssignable,
        staffCoverageEligible: payload.staffCoverageEligible,
        defaultStaffCoverageWorkType:
          (payload.defaultStaffCoverageWorkType as any) || undefined,
        shirtSize: payload.shirtSize || "",
        gearNotes: payload.gearNotes || undefined,
        licenseInfo: {
          licenseType: payload.licenseInfo.licenseType,
          licenseNumber: payload.licenseInfo.licenseNumber || undefined,
          issuingState: payload.licenseInfo.issuingState || undefined,
          expirationDate: payload.licenseInfo.expirationDate || undefined,
          notes: payload.licenseInfo.notes || undefined,
        },
        driverInfo: {
          canDriveCompanyVehicle: payload.driverInfo.canDriveCompanyVehicle,
          driversLicenseNumber:
            payload.driverInfo.driversLicenseNumber || undefined,
          driversLicenseState: payload.driverInfo.driversLicenseState || undefined,
          driversLicenseExpirationDate:
            payload.driverInfo.driversLicenseExpirationDate || undefined,
          insuranceApproved: payload.driverInfo.insuranceApproved,
          notes: payload.driverInfo.notes || undefined,
        },
        notes: payload.notes || undefined,
        updatedAt: payload.updatedAt,
      };

      setProfile(updatedProfile);
      setSaveMsg("Employee profile saved.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save employee profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    const ok = window.confirm("Delete this employee profile? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    setError("");

    try {
      if (profile.userUid) {
        await updateDoc(doc(db, "users", profile.userUid), {
          employeeProfileId: null,
          updatedAt: new Date().toISOString(),
        });
      }

      await deleteDoc(doc(db, "employeeProfiles", profile.id));
      window.location.href = "/admin/employee-profiles";
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete employee profile."
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleLinkQbo() {
    if (!profile) return;

    setLinkingQbo(true);
    setQboLinkError("");
    setQboLinkMsg("");

    try {
      const qboId = selectedQboId.trim();
      if (!qboId) {
        setQboLinkError("Select a QuickBooks employee first.");
        setLinkingQbo(false);
        return;
      }

      const match = qboEmployees.find((e) => e.id === qboId);
      if (!match) {
        setQboLinkError("Selected QuickBooks employee not found.");
        setLinkingQbo(false);
        return;
      }

      const hiredDate = match.hiredDate || "";
      const eligibilityDate = hiredDate ? addDaysIso(hiredDate, 365) : "";
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "employeeProfiles", profile.id), {
        qboEmployeeId: match.id,
        qboEmployeeDisplayName: match.displayName || null,
        qboEmployeeHiredDate: hiredDate || null,
        ptoEligibilityDate: eligibilityDate || null,
        updatedAt: nowIso,
      });

      setProfile({
        ...profile,
        qboEmployeeId: match.id,
        qboEmployeeDisplayName: match.displayName || undefined,
        qboEmployeeHiredDate: hiredDate || undefined,
        ptoEligibilityDate: eligibilityDate || undefined,
        updatedAt: nowIso,
      });

      if (!displayName && match.displayName) setDisplayName(match.displayName);
      if (!email && match.email) setEmail(match.email);

      setQboLinkMsg("QuickBooks employee linked successfully.");
    } catch (err: unknown) {
      setQboLinkError(
        err instanceof Error
          ? err.message
          : "Failed to link QuickBooks employee."
      );
    } finally {
      setLinkingQbo(false);
    }
  }

  async function handleUnlinkQbo() {
    if (!profile) return;

    const ok = window.confirm("Unlink QuickBooks employee from this profile?");
    if (!ok) return;

    setLinkingQbo(true);
    setQboLinkError("");
    setQboLinkMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "employeeProfiles", profile.id), {
        qboEmployeeId: null,
        qboEmployeeDisplayName: null,
        qboEmployeeHiredDate: null,
        ptoEligibilityDate: null,
        updatedAt: nowIso,
      });

      setProfile({
        ...profile,
        qboEmployeeId: undefined,
        qboEmployeeDisplayName: undefined,
        qboEmployeeHiredDate: undefined,
        ptoEligibilityDate: undefined,
        updatedAt: nowIso,
      });

      setSelectedQboId("");
      setQboLinkMsg("QuickBooks employee unlinked.");
    } catch (err: unknown) {
      setQboLinkError(
        err instanceof Error
          ? err.message
          : "Failed to unlink QuickBooks employee."
      );
    } finally {
      setLinkingQbo(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profile" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1120, mx: "auto" }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", lg: "center" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    icon={<BadgeRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Employee"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                    }}
                  />
                  {profile?.employmentStatus ? (
                    <Chip
                      size="small"
                      label={titleCase(profile.employmentStatus)}
                      variant="outlined"
                      sx={{ borderRadius: 1.5, fontWeight: 600 }}
                    />
                  ) : null}
                </Stack>

                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.65rem", md: "2rem" },
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {loading ? "Employee" : displayName || "Employee"}
                </Typography>

                <Typography
                  sx={{
                    mt: 0.8,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 900,
                  }}
                >
                  One admin record for employee details, QuickBooks, DCFlow access,
                  schedule eligibility, gear, license, and driving status.
                </Typography>

                <Typography
                  variant="caption"
                  sx={{ mt: 1, display: "block", color: "text.secondary" }}
                >
                  Profile ID: {profileId || "—"}
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/admin/employee-profiles"
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2 }}
              >
                Back
              </Button>
            </Stack>

            {error ? (
              <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            ) : null}

            {saveMsg ? (
              <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                {saveMsg}
              </Alert>
            ) : null}

            {loading ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <Box sx={{ p: 3 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                      Loading employee profile...
                    </Typography>
                  </Stack>
                </Box>
              </Card>
            ) : null}

            {!loading && profile ? (
              <>
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                  }}
                >
                  <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontSize: { xs: "1rem", md: "1.05rem" },
                            fontWeight: 800,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          Quick snapshot
                        </Typography>

                        <Typography
                          sx={{
                            mt: 0.5,
                            color: "text.secondary",
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          High-level employee status and linked systems summary.
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          label={`Role: ${titleCase(laborRole)}`}
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                        <Chip
                          size="small"
                          label={`Status: ${titleCase(employmentStatus)}`}
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                        <Chip
                          size="small"
                          label={profile.qboEmployeeId ? "QuickBooks linked" : "QuickBooks not linked"}
                          color={profile.qboEmployeeId ? "success" : "default"}
                          variant={profile.qboEmployeeId ? "filled" : "outlined"}
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                        <Chip
                          size="small"
                          label={selectedUser ? `Login: ${roleLabel(selectedUser.role)}` : "No DCFlow login"}
                          color={selectedUser?.active !== false && selectedUser ? "success" : "default"}
                          variant="outlined"
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                        {shirtSize ? (
                          <Chip
                            size="small"
                            label={`Shirt: ${shirtSize}`}
                            variant="outlined"
                            sx={{ borderRadius: 1.5, fontWeight: 600 }}
                          />
                        ) : null}
                        {licenseType !== "none" ? (
                          <Chip
                            size="small"
                            label={licenseLabel(licenseType)}
                            color="secondary"
                            variant="outlined"
                            sx={{ borderRadius: 1.5, fontWeight: 600 }}
                          />
                        ) : null}
                        {canDriveCompanyVehicle ? (
                          <Chip
                            size="small"
                            label={insuranceApproved ? "Approved Driver" : "Can Drive"}
                            color={insuranceApproved ? "success" : "warning"}
                            variant="outlined"
                            sx={{ borderRadius: 1.5, fontWeight: 600 }}
                          />
                        ) : null}
                      </Stack>
                    </Stack>
                  </Box>
                </Card>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: "background.paper",
                  }}
                >
                  <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                    <SectionHeader
                      icon={<AccountBalanceRoundedIcon sx={{ fontSize: 22 }} />}
                      title="QuickBooks Link"
                      subtitle="Link this employee profile to a QuickBooks employee to pull hire date and compute PTO eligibility."
                    />
                  </Box>

                  <Divider />

                  <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack spacing={2}>
                      {qboLoading ? (
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <CircularProgress size={18} />
                          <Typography variant="body2" color="text.secondary">
                            Loading QuickBooks employees...
                          </Typography>
                        </Stack>
                      ) : null}

                      {qboLinkError ? (
                        <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                          {qboLinkError}
                        </Alert>
                      ) : null}

                      {qboLinkMsg ? (
                        <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                          {qboLinkMsg}
                        </Alert>
                      ) : null}

                      {profile.qboEmployeeId ? (
                        <Card
                          elevation={0}
                          sx={{
                            borderRadius: 2.5,
                            border: `1px solid ${alpha(theme.palette.success.main, 0.22)}`,
                            backgroundColor: alpha(theme.palette.success.main, 0.07),
                          }}
                        >
                          <Box sx={{ p: 2 }}>
                            <Stack spacing={1.25}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                Linked: {profile.qboEmployeeDisplayName || "—"}
                              </Typography>

                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip
                                  size="small"
                                  label={`QBO ID: ${profile.qboEmployeeId}`}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                                <Chip
                                  size="small"
                                  label={`Hired: ${profile.qboEmployeeHiredDate || "—"}`}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                                <Chip
                                  size="small"
                                  label={`PTO Eligible: ${profile.ptoEligibilityDate || "—"}`}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                              </Stack>

                              <Box>
                                <Button
                                  type="button"
                                  onClick={handleUnlinkQbo}
                                  disabled={linkingQbo}
                                  variant="outlined"
                                  color="inherit"
                                  startIcon={<LinkRoundedIcon />}
                                  sx={{ borderRadius: 2 }}
                                >
                                  {linkingQbo
                                    ? "Working..."
                                    : "Unlink QuickBooks Employee"}
                                </Button>
                              </Box>
                            </Stack>
                          </Box>
                        </Card>
                      ) : (
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.25 }}>
                            <Switch
                              checked={showInactiveQbo}
                              onChange={(e) => setShowInactiveQbo(e.target.checked)}
                            />
                            <Typography variant="body2">
                              Show inactive QuickBooks employees
                            </Typography>
                          </Stack>

                          <FormControl fullWidth>
                            <InputLabel>Select QuickBooks Employee</InputLabel>
                            <Select
                              label="Select QuickBooks Employee"
                              value={selectedQboId}
                              onChange={(e: SelectChangeEvent) =>
                                setSelectedQboId(e.target.value)
                              }
                            >
                              <MenuItem value="">— Select —</MenuItem>
                              {filteredQboEmployees.map((e) => (
                                <MenuItem key={e.id} value={e.id}>
                                  {e.displayName || "Unnamed"} · Hired: {e.hiredDate || "—"} · {e.active === false ? "INACTIVE" : "ACTIVE"}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          {selectedQbo ? (
                            <Card
                              elevation={0}
                              sx={{
                                borderRadius: 2.5,
                                border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                                backgroundColor: alpha("#FFFFFF", 0.02),
                              }}
                            >
                              <Box sx={{ p: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                  Selected QuickBooks employee
                                </Typography>
                                <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 700 }}>
                                  {selectedQbo.displayName || "—"}
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
                                  Email: {selectedQbo.email || "—"}
                                </Typography>
                              </Box>
                            </Card>
                          ) : null}

                          <Box>
                            <Button
                              type="button"
                              onClick={handleLinkQbo}
                              disabled={linkingQbo}
                              variant="contained"
                              startIcon={<LinkRoundedIcon />}
                              sx={{ borderRadius: 2 }}
                            >
                              {linkingQbo ? "Linking..." : "Link QBO Employee"}
                            </Button>
                          </Box>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                </Card>

                <Box
                  component="form"
                  onSubmit={handleSave}
                  sx={{ display: "grid", gap: 2 }}
                >
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<LinkRoundedIcon sx={{ fontSize: 22 }} />}
                        title="DCFlow Access"
                        subtitle="Attach this employee to an existing DCFlow login account. Login role and password are still managed from the access/user account flow."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <FormControl fullWidth>
                          <InputLabel>Linked User</InputLabel>
                          <Select
                            label="Linked User"
                            value={userUid}
                            onChange={(e: SelectChangeEvent) => setUserUid(e.target.value)}
                          >
                            <MenuItem value="">— No user linked —</MenuItem>
                            {users.map((u) => (
                              <MenuItem key={u.uid} value={u.uid}>
                                {u.displayName || "Unnamed"} — {u.email || "no email"} ({roleLabel(u.role)})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {selectedUser ? (
                          <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                            Linked login: {selectedUser.displayName || "Unnamed"} · {roleLabel(selectedUser.role)} · {selectedUser.active === false ? "Inactive" : "Active"}
                          </Alert>
                        ) : (
                          <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                            This employee has no DCFlow login. That is okay for employees who do not need app access.
                          </Alert>
                        )}
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<PersonRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Profile"
                        subtitle="Core employee identity and contact information."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <TextField
                          label="Display Name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          required
                          fullWidth
                        />

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                          <TextField
                            label="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            fullWidth
                          />

                          <TextField
                            label="Phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            fullWidth
                          />
                        </Box>
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<EventAvailableRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Scheduling & Field Assignment"
                        subtitle="Controls whether this employee appears on the schedule and can be assigned to field or staff coverage work."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={showOnSchedule}
                                onChange={(e) => setShowOnSchedule(e.target.checked)}
                              />
                            }
                            label="Show on Schedule"
                          />

                          <FormControlLabel
                            control={
                              <Switch
                                checked={fieldAssignable}
                                onChange={(e) => setFieldAssignable(e.target.checked)}
                              />
                            }
                            label="Field Assignable"
                          />

                          <FormControlLabel
                            control={
                              <Switch
                                checked={staffCoverageEligible}
                                onChange={(e) => setStaffCoverageEligible(e.target.checked)}
                              />
                            }
                            label="Staff Coverage Eligible"
                          />
                        </Box>

                        <FormControl fullWidth disabled={!staffCoverageEligible}>
                          <InputLabel>Default Staff Coverage Work Type</InputLabel>
                          <Select
                            label="Default Staff Coverage Work Type"
                            value={defaultStaffCoverageWorkType}
                            onChange={(e: SelectChangeEvent) =>
                              setDefaultStaffCoverageWorkType(e.target.value)
                            }
                          >
                            {staffCoverageWorkTypes.map((option) => (
                              <MenuItem key={option.value || "none"} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<WorkHistoryRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Employment"
                        subtitle="Roster status, labor role, helper pairing, and operational notes."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                          <FormControl fullWidth>
                            <InputLabel>Employment Status</InputLabel>
                            <Select
                              label="Employment Status"
                              value={employmentStatus}
                              onChange={(e: SelectChangeEvent) =>
                                setEmploymentStatus(e.target.value as EmploymentStatus)
                              }
                            >
                              {employmentStatuses.map((s) => (
                                <MenuItem key={s} value={s}>
                                  {titleCase(s)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <FormControl fullWidth>
                            <InputLabel>Labor Role</InputLabel>
                            <Select
                              label="Labor Role"
                              value={laborRole}
                              onChange={(e: SelectChangeEvent) =>
                                setLaborRole(e.target.value as LaborRole)
                              }
                            >
                              {laborRoles.map((r) => (
                                <MenuItem key={r} value={r}>
                                  {titleCase(r)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>

                        <FormControl fullWidth>
                          <InputLabel>Default Paired Technician</InputLabel>
                          <Select
                            label="Default Paired Technician"
                            value={defaultPairedTechUid}
                            onChange={(e: SelectChangeEvent) =>
                              setDefaultPairedTechUid(e.target.value)
                            }
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {techUsers.map((u) => (
                              <MenuItem key={u.uid} value={u.uid}>
                                {u.displayName || "Unnamed"} — {u.email || "no email"}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<CheckroomRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Company Gear"
                        subtitle="Stores shirt size and notes for apparel and gear orders."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <FormControl fullWidth>
                          <InputLabel>Shirt Size</InputLabel>
                          <Select
                            label="Shirt Size"
                            value={shirtSize}
                            onChange={(e: SelectChangeEvent) =>
                              setShirtSize(e.target.value as ShirtSize | "")
                            }
                          >
                            <MenuItem value="">— No size selected —</MenuItem>
                            {shirtSizes.map((size) => (
                              <MenuItem key={size} value={size}>
                                {size}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <TextField
                          label="Gear Notes"
                          value={gearNotes}
                          onChange={(e) => setGearNotes(e.target.value)}
                          placeholder="Example: prefers tall shirts, hoodie size is different, needs long sleeves, etc."
                          multiline
                          minRows={3}
                          fullWidth
                        />
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<WorkspacePremiumRoundedIcon sx={{ fontSize: 22 }} />}
                        title="License Info"
                        subtitle="Tracks apprentice, tradesman, journeyman, master, or other plumbing license information."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <FormControl fullWidth>
                          <InputLabel>License Type</InputLabel>
                          <Select
                            label="License Type"
                            value={licenseType}
                            onChange={(e: SelectChangeEvent) =>
                              setLicenseType(e.target.value as PlumbingLicenseType)
                            }
                          >
                            {licenseTypes.map((type) => (
                              <MenuItem key={type} value={type}>
                                {licenseLabel(type)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                          <TextField
                            label="License Number"
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            disabled={licenseType === "none"}
                            fullWidth
                          />

                          <TextField
                            label="Issuing State"
                            value={licenseIssuingState}
                            onChange={(e) => setLicenseIssuingState(e.target.value)}
                            disabled={licenseType === "none"}
                            fullWidth
                          />
                        </Box>

                        <TextField
                          label="Expiration Date"
                          type="date"
                          value={licenseExpirationDate}
                          onChange={(e) => setLicenseExpirationDate(e.target.value)}
                          disabled={licenseType === "none"}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />

                        <TextField
                          label="License Notes"
                          value={licenseNotes}
                          onChange={(e) => setLicenseNotes(e.target.value)}
                          disabled={licenseType === "none"}
                          multiline
                          minRows={3}
                          fullWidth
                        />
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<DirectionsCarRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Driver / Vehicle Eligibility"
                        subtitle="Used later for vehicle assignment, approved drivers, oil-change requests, and vehicle tracking."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={canDriveCompanyVehicle}
                                onChange={(e) => setCanDriveCompanyVehicle(e.target.checked)}
                              />
                            }
                            label="Can Drive Company Vehicle"
                          />

                          <FormControlLabel
                            control={
                              <Switch
                                checked={insuranceApproved}
                                onChange={(e) => setInsuranceApproved(e.target.checked)}
                                disabled={!canDriveCompanyVehicle}
                              />
                            }
                            label="Insurance Approved"
                          />
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                          <TextField
                            label="Driver License Number"
                            value={driversLicenseNumber}
                            onChange={(e) => setDriversLicenseNumber(e.target.value)}
                            disabled={!canDriveCompanyVehicle}
                            fullWidth
                          />

                          <TextField
                            label="Driver License State"
                            value={driversLicenseState}
                            onChange={(e) => setDriversLicenseState(e.target.value)}
                            disabled={!canDriveCompanyVehicle}
                            fullWidth
                          />
                        </Box>

                        <TextField
                          label="Driver License Expiration Date"
                          type="date"
                          value={driversLicenseExpirationDate}
                          onChange={(e) => setDriversLicenseExpirationDate(e.target.value)}
                          disabled={!canDriveCompanyVehicle}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />

                        <TextField
                          label="Driver Notes"
                          value={driverNotes}
                          onChange={(e) => setDriverNotes(e.target.value)}
                          disabled={!canDriveCompanyVehicle}
                          placeholder="Example: approved for service trucks only, needs insurance review, etc."
                          multiline
                          minRows={3}
                          fullWidth
                        />
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<NotesRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Notes & Actions"
                        subtitle="Save operational notes and employee profile changes."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <TextField
                          label="Notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          multiline
                          minRows={4}
                          fullWidth
                        />

                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1.25}
                          alignItems={{ xs: "stretch", sm: "center" }}
                        >
                          <Button
                            type="submit"
                            disabled={saving}
                            variant="contained"
                            startIcon={<SaveRoundedIcon />}
                            sx={{ minHeight: 42, borderRadius: 2 }}
                          >
                            {saving ? "Saving..." : "Save Employee"}
                          </Button>

                          <Button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteRoundedIcon />}
                            sx={{ minHeight: 42, borderRadius: 2 }}
                          >
                            {deleting ? "Deleting..." : "Delete Profile"}
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  </Card>
                </Box>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}
