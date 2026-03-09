import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "@/lib/firebase";

interface DeleteUserByAdminPayload {
  userId: string;
  allowTeacherDeletion?: boolean;
}

interface DeleteUserByAdminResponse {
  ok: boolean;
  userId: string;
}

const deleteUserByAdminCallable = httpsCallable<
  DeleteUserByAdminPayload,
  DeleteUserByAdminResponse
>(firebaseFunctions, "deleteUserByAdmin");

export async function deleteUserByAdmin(
  userId: string,
  options?: { allowTeacherDeletion?: boolean },
): Promise<void> {
  const normalizedUserId = (userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("User id is required.");
  }

  await deleteUserByAdminCallable({
    userId: normalizedUserId,
    allowTeacherDeletion: Boolean(options?.allowTeacherDeletion),
  });
}
