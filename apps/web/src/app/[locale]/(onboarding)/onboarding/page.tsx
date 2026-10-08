import { OnboardingWizard } from "@/components/onboarding/wizard";
import { requireSession } from "@/lib/session";

export default async function OnboardingPage() {
  const { user } = await requireSession();
  // Keyed by user: on a shared phone, one student's answers never show for another.
  return <OnboardingWizard key={user.id} userId={user.id} />;
}
