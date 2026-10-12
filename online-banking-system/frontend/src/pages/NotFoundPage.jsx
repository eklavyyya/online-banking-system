import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4">
      <h1 className="text-6xl font-bold font-serif text-navy mb-2">404</h1>
      <p className="text-gray-500 mb-6">This page doesn't exist.</p>
      <Link to="/" className="text-navy font-medium hover:underline">Back to Dashboard</Link>
    </div>
  );
}
