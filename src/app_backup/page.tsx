import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm text-center">
        <h1 className="text-2xl font-bold mb-4">DCFlow</h1>
        <p className="text-sm text-gray-600 mb-4">
          Foundation build is in progress.
        </p>
        <Link href="/login" className="underline">
          Go to Login
        </Link>
      </div>
    </main>
  );
}