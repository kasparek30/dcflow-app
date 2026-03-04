// src/lib/payroll.ts

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPayrollWeekBounds(entryDate: string) {
  const date = new Date(`${entryDate}T12:00:00`);
  const day = date.getDay(); // Sun 0 ... Sat 6

  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    weekStartDate: toIsoDate(monday),
    weekEndDate: toIsoDate(friday),
  };
}