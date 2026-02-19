import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <SignUp 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-gray-800 border-gray-700",
          }
        }}
      />
    </div>
  );
}
