import { useQueryClient } from "@tanstack/react-query";
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
import { reloadForNewSession } from "@/lib/auth/session-change";
import { linkCitizenFn } from "@/server/citizens/functions";

const searchSchema = z.object({ redirect: z.string().optional() });

const SignUpPage = () => {
  const redirectTo = sanitizeRedirect(Route.useSearch().redirect);
  const queryClient = useQueryClient();
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
      // better-auth messages are in English, so the page shows its own text.
      return error.code === "USER_ALREADY_EXISTS"
        ? "Ya existe una cuenta con este correo. Inicie sesión."
        : "No pudimos crear la cuenta. Intente de nuevo.";
    }
    let linked = true;
    try {
      await linkCitizen({ data: { documentType, documentNumber } });
    } catch {
      linked = false;
    }
    // Load the routes and queries again only after the link, so that no page caches the account without its citizen.
    await reloadForNewSession(queryClient, router);
    // When the link is refused, the account exists and the user is signed in. The account page shows the document form again.
    await (linked
      ? navigate({ href: redirectTo })
      : navigate({ to: "/account" }));
    return null;
  };

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Su documento une la cuenta con sus comparendos y trámites.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm onSignUp={signUp} />
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        <p>
          ¿Ya tiene una cuenta?{" "}
          <Link
            className="text-foreground font-medium underline underline-offset-4"
            search={{ redirect: redirectTo === "/" ? undefined : redirectTo }}
            to="/sign-in"
          >
            Iniciar sesión
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
  head: () => ({ meta: [{ title: "Crear cuenta | Transipay" }] }),
  component: SignUpPage,
});
