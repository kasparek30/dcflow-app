// src/types/fleet-vehicle.ts

export type FleetVehicleStatus =
  | "active"
  | "spare"
  | "out_of_service"
  | "sold";

export type FleetMaintenanceType =
  | "oil_change"
  | "tires"
  | "brakes"
  | "battery"
  | "inspection"
  | "registration"
  | "repair"
  | "preventive_maintenance"
  | "other";

export type FleetVehicleWarningType =
  | "registration_expiring"
  | "insurance_expiring"
  | "inspection_expiring"
  | "oil_change_due"
  | "maintenance_open"
  | "year_end_mileage_needed";

export type FleetMaintenanceLogEntry = {
  id: string;

  type: FleetMaintenanceType;
  date: string;

  odometer?: number;
  vendor?: string;
  cost?: number;
  notes?: string;

  nextDueDate?: string;
  nextDueMileage?: number;

  isOpenIssue?: boolean;
  resolvedAt?: string;
  resolvedNotes?: string;

  createdAt: string;
  createdByUid?: string;
  createdByName?: string;

  updatedAt?: string;
  updatedByUid?: string;
  updatedByName?: string;
};

export type FleetYearEndMileageEntry = {
  taxYear: number;

  startMileage?: number;
  startMileageDate?: string;

  endMileage?: number;
  endMileageDate?: string;

  enteredAt?: string;
  enteredByUid?: string;
  enteredByName?: string;

  notes?: string;
};

export type FleetVehicle = {
  id: string;

  unitNumber: string;
  name: string;

  year?: number;
  make?: string;
  model?: string;
  trim?: string;

  vin?: string;
  licensePlate?: string;

  status: FleetVehicleStatus;

  assignedEmployeeUid?: string;
  assignedEmployeeName?: string;

  currentOdometer?: number;
  odometerUpdatedAt?: string;
  odometerUpdatedByUid?: string;
  odometerUpdatedByName?: string;

  registrationExpiresAt?: string;
  insuranceExpiresAt?: string;
  inspectionExpiresAt?: string;

  lastOilChangeDate?: string;
  lastOilChangeMileage?: number;
  nextOilChangeDate?: string;
  nextOilChangeMileage?: number;

  maintenanceLogs?: FleetMaintenanceLogEntry[];

  yearEndMileage?: FleetYearEndMileageEntry[];

  notes?: string;

  createdAt: string;
  createdByUid?: string;
  createdByName?: string;

  updatedAt: string;
  updatedByUid?: string;
  updatedByName?: string;
};

export const FLEET_VEHICLE_STATUSES: {
  value: FleetVehicleStatus;
  label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "spare", label: "Spare" },
  { value: "out_of_service", label: "Out of Service" },
  { value: "sold", label: "Sold" },
];

export const FLEET_MAINTENANCE_TYPES: {
  value: FleetMaintenanceType;
  label: string;
}[] = [
  { value: "oil_change", label: "Oil Change" },
  { value: "tires", label: "Tires" },
  { value: "brakes", label: "Brakes" },
  { value: "battery", label: "Battery" },
  { value: "inspection", label: "Inspection" },
  { value: "registration", label: "Registration" },
  { value: "repair", label: "Repair" },
  { value: "preventive_maintenance", label: "Preventive Maintenance" },
  { value: "other", label: "Other" },
];

export function getFleetVehicleStatusLabel(status: FleetVehicleStatus): string {
  return (
    FLEET_VEHICLE_STATUSES.find((option) => option.value === status)?.label ??
    status
  );
}

export function getFleetMaintenanceTypeLabel(type: FleetMaintenanceType): string {
  return (
    FLEET_MAINTENANCE_TYPES.find((option) => option.value === type)?.label ??
    type
  );
}

export function getFleetVehicleDisplayName(vehicle: Partial<FleetVehicle>): string {
  const unit = vehicle.unitNumber ? `Unit ${vehicle.unitNumber}` : "Fleet Vehicle";
  const vehicleName = vehicle.name?.trim();

  if (vehicleName) {
    return `${unit} — ${vehicleName}`;
  }

  const makeModel = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ")
    .trim();

  return makeModel ? `${unit} — ${makeModel}` : unit;
}

export function getFleetVehicleShortName(vehicle: Partial<FleetVehicle>): string {
  if (vehicle.name?.trim()) return vehicle.name.trim();
  if (vehicle.unitNumber?.trim()) return `Unit ${vehicle.unitNumber.trim()}`;

  return "Fleet Vehicle";
}

export function isFleetVehicleActive(vehicle: Partial<FleetVehicle>): boolean {
  return vehicle.status === "active" || vehicle.status === "spare";
}

export function hasOpenMaintenanceIssue(vehicle: Partial<FleetVehicle>): boolean {
  return Boolean(vehicle.maintenanceLogs?.some((entry) => entry.isOpenIssue));
}

export function getMostRecentMaintenanceLog(
  vehicle: Partial<FleetVehicle>
): FleetMaintenanceLogEntry | null {
  const logs = vehicle.maintenanceLogs ?? [];

  if (!logs.length) return null;

  return [...logs].sort((a, b) => {
    const aTime = new Date(a.date || a.createdAt).getTime();
    const bTime = new Date(b.date || b.createdAt).getTime();
    return bTime - aTime;
  })[0];
}

export function getFleetYearEndMileageEntry(
  vehicle: Partial<FleetVehicle>,
  taxYear: number
): FleetYearEndMileageEntry | null {
  return (
    vehicle.yearEndMileage?.find((entry) => entry.taxYear === taxYear) ?? null
  );
}

export function needsYearEndMileage(
  vehicle: Partial<FleetVehicle>,
  taxYear: number
): boolean {
  if (!isFleetVehicleActive(vehicle)) return false;

  const entry = getFleetYearEndMileageEntry(vehicle, taxYear);

  return !entry?.endMileage;
}

export function getFleetMileageReminderTaxYear(date = new Date()): number {
  return date.getFullYear() - 1;
}