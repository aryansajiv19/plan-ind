import ProfileNameForm from "@/components/ProfileNameForm";
import ProfileEmojiForm from "@/components/ProfileEmojiForm";
import BirthdayCorrection from "@/components/BirthdayCorrection";
import DeleteAccount from "@/components/account/DeleteAccount";
import SignOutForm from "@/components/account/SignOutForm";

// P14: Settings, at the top of Profile rather than a sixth tab: the name and
// emoji friends see, the one birthday correction, sign out, and deletion.
export default function SettingsBlock({ name, emoji, personId }: { name: string; emoji: string | null; personId: string | null }) {
  return (
    <section id="settings" className="settings-block" aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      {personId && <ProfileNameForm personId={personId} name={name} />}
      {personId && <ProfileEmojiForm personId={personId} emoji={emoji} />}
      {personId && <BirthdayCorrection />}
      <div className="settings-block__account">
        <SignOutForm name={name} />
        <DeleteAccount />
      </div>
    </section>
  );
}
