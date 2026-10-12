import { PrimaryButton, SecondaryButton } from './ui';

export default function IdleWarning({ secondsLeft, onStay, onLogout }) {
  return (
    <div className="fixed inset-0 bg-navy/70 flex items-center justify-center z-[60] p-4" role="alertdialog" aria-modal="true" aria-label="Session about to expire">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
        <h3 className="text-lg font-bold text-navy mb-2">Still there?</h3>
        <p className="text-sm text-gray-600 mb-1">For your security you will be signed out after a period of inactivity.</p>
        <p className="text-3xl font-bold font-serif text-navy my-4" aria-live="polite">{secondsLeft}s</p>
        <div className="flex gap-3">
          <SecondaryButton className="flex-1" onClick={onLogout}>Sign out</SecondaryButton>
          <PrimaryButton className="flex-1" onClick={onStay} autoFocus>Stay signed in</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
