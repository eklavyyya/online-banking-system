import { ErrorBanner, SuccessBanner, SecondaryButton } from '../../components/ui';

/** The shared banners inside a persistent live region, so screen readers announce changes. */
export function ErrorNotice({ message, className = '' }) {
  return <div role="alert" className={className}><ErrorBanner message={message} /></div>;
}

/** Give it an `id` when a page needs to move keyboard focus here after an action removed the button that was used. */
export function SuccessNotice({ message, className = '', id }) {
  return <div role="status" id={id} tabIndex={-1} className={`${className} focus:outline-none`}><SuccessBanner message={message} /></div>;
}

/** A failed load, with a way to try again. */
export function LoadError({ message, onRetry }) {
  if (!message) return null;
  return (
    <div>
      <ErrorNotice message={message} />
      {onRetry && <SecondaryButton onClick={onRetry}>Try again</SecondaryButton>}
    </div>
  );
}
