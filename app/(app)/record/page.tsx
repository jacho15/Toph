import { redirect } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";
import VoiceRecorder from "@/components/VoiceRecorder";
import { getViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function RecordPage() {
  const viewer = await getViewer();
  const isAdminOrManager = viewer.role === "admin" || viewer.role === "manager";

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("farm_id").eq("id", viewer.id).single();
  if (!profile) redirect("/login");

  return (
    <>
      <DashboardHeader
        title="New Voice Log"
        subtitle={
          isAdminOrManager
            ? "Upload a recording from the field — Toph transcribes it and files it under the right person"
            : "Record a guided activity log — Toph transcribes it and fills in the details"
        }
      />
      <VoiceRecorder farmId={profile.farm_id} userId={viewer.id} viewerRole={viewer.role} viewerName={viewer.full_name} />
    </>
  );
}
