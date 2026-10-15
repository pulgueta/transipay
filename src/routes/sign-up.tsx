import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { SignUpForm } from "@/components/auth/sign-up-form";
import type { SignUpValues } from "@/components/auth/sign-up-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth/client";
import { sanitizeRedirect } from "@/lib/auth/guards";
import { linkCitizenFn } from "@/server/citizens/functions";

const searchSchema = z.object({ redirect: z.string().optional() });

const SignUpPage = () => {
  const redirectTo = sanitizeRedirect(Route.useSearch().redirect);
  const router = useRouter();
  const navigate = useNavigate();
  const linkCitizen = useServerFn(linkCitizenFn);

  const signUp = async ({
    documentType,
    documentNumber,
    ...account
  }: SignUpValues) => {
    const { error } = await authClient.signUp.email(account);
    if (error) {
      return error.code === "USER_ALREADY_EXISTS"
        ? "An account with this email exists. Sign in instead."
        : (error.message ?? "We could not create the account. Try again.");
    }
    await router.invalidate();
    try {
      await linkCitizen({ data: { documentType, documentNumber } });
    } catch {
      // The account exists and the user is signed in. The account page shows the document form again.
      await navigate({ to: "/account" });
      return null;
    }
    await navigate({ href: redirectTo });
    return null;
  };

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Your document links the account to your fines and procedures.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm onSignUp={signUp} />
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        <p>
          Already have an account?{" "}
          <Link
            className="text-foreground font-medium underline underline-offset-4"
            search={{ redirect: redirectTo === "/" ? undefined : redirectTo }}
            to="/sign-in"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
};

export const Route = createFileRoute("/sign-up")({
  validateSearch: searchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      redirect({ href: sanitizeRedirect(search.redirect), throw: true });
    }
  },
  head: () => ({ meta: [{ title: "Create account | Transipay" }] }),
  component: SignUpPage,
});
