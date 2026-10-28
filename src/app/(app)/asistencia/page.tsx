import type { Metadata } from "next";
import { AttendanceScreen } from "@/features/attendance/attendance-screen";

export const metadata: Metadata = { title: "Asistencia" };

export default function AttendancePage() {
  return <AttendanceScreen />;
}
