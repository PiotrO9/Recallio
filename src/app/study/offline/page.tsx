import { AuthFrame } from "@/features/auth/auth-frame";
import { StudySession } from "@/features/study/study-session";

export const metadata = { title: "Nauka offline" };

export default function OfflineStudyPage() {
  return (
    <AuthFrame variant="study">
      <StudySession />
    </AuthFrame>
  );
}
