import DashboardHeader from "@/components/DashboardHeader";
import FarmMapLoader from "@/components/FarmMapLoader";
import { getFarmMapData } from "@/lib/data-pages";

export default async function MapPage() {
  const { fields, locations } = await getFarmMapData();

  return (
    <>
      <DashboardHeader title="Map" subtitle="Fields and recent activity locations" />
      <FarmMapLoader fields={fields} locations={locations} />
    </>
  );
}
