import { getUsersAction } from "@/actions/users";
import { UsersClient } from "./users-client";

export default async function AdminUsersPage() {
  const { users } = await getUsersAction();
  return <UsersClient initialUsers={users} />;
}
