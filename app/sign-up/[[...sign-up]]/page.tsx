import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-card border border-border shadow-lg",
            }
          }}
          routing="path"
          path="/sign-up"
          redirectUrl="/app"
          signInUrl="/sign-in"
        />
      </div>
    </div>
  )
}