import { AuthFrame } from "@/features/auth/auth-frame";
import { StudySession } from "@/features/study/study-session";

export default function OfflineStudyPage() {
  return (
    <AuthFrame title="Nauka">
      <StudySession />
    </AuthFrame>
  );
}
