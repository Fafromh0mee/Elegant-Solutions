import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <ProfileClient user={session.user} />;
}
