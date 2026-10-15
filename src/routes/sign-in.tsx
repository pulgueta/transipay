import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { z } from "zod";

import { SignInForm } from "@/components/auth/sign-in-form";
import type { SignInValues } from "@/components/auth/sign-in-form";
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

/** `redirect` is the page to go back to after sign-in. `sanitizeRedirect` keeps only a path in this app. */
const searchSchema = z.object({ redirect: z.string().optional() });

const SignInPage = () => {
  const redirectTo = sanitizeRedirect(Route.useSearch().redirect);
  const router = useRouter();
  const navigate = useNavigate();

  const signIn = async (values: SignInValues) => {
    const { error } = await authClient.signIn.email(values);
    if (error) {
      return error.status === 401
        ? "The email or password is not correct."
        : (error.message ?? "We could not sign you in. Try again.");
    }
    // The root route loads the session again on navigation.
    await router.invalidate();
    await navigate({ href: redirectTo });
    return null;
  };

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use the email and password of your Transipay account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm onSignIn={signIn} />
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        <p>
          No account yet?{" "}
          <Link
            className="text-foreground font-medium underline underline-offset-4"
            search={{ redirect: redirectTo === "/" ? undefined : redirectTo }}
            to="/sign-up"
          >
            Create account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
};

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      redirect({ href: sanitizeRedirect(search.redirect), throw: true });
    }
  },
  head: () => ({ meta: [{ title: "Sign in | Transipay" }] }),
  component: SignInPage,
});
