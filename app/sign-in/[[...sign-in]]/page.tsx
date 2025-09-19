import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-card border border-border shadow-lg",
            }
          }}
          routing="path"
          path="/sign-in"
          redirectUrl="/app"
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  )
}