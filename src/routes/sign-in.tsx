import { useQueryClient } from "@tanstack/react-query";
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
import { reloadForNewSession } from "@/lib/auth/session-change";

/** `redirect` is the page to go back to after sign-in. `sanitizeRedirect` keeps only a path in this app. */
const searchSchema = z.object({ redirect: z.string().optional() });

const SignInPage = () => {
  const redirectTo = sanitizeRedirect(Route.useSearch().redirect);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  const signIn = async (values: SignInValues) => {
    const { error } = await authClient.signIn.email(values);
    if (error) {
      // better-auth messages are in English, so the page shows its own text.
      if (error.status === 401) {
        return "El correo o la contraseña no son correctos.";
      }
      return error.code === "BANNED_USER"
        ? "Su cuenta está suspendida. Comuníquese con el Tránsito para más información."
        : "No pudimos iniciar la sesión. Intente de nuevo.";
    }
    // The root route loads the session again on navigation.
    await reloadForNewSession(queryClient, router);
    await navigate({ href: redirectTo });
    return null;
  };

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>
          Use el correo y la contraseña de su cuenta de Transipay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm onSignIn={signIn} />
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        <p>
          ¿No tiene una cuenta?{" "}
          <Link
            className="text-foreground font-medium underline underline-offset-4"
            search={{ redirect: redirectTo === "/" ? undefined : redirectTo }}
            to="/sign-up"
          >
            Crear cuenta
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
  head: () => ({ meta: [{ title: "Iniciar sesión | Transipay" }] }),
  component: SignInPage,
});
