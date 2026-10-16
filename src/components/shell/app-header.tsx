import { IconLogout, IconMenu2, IconUserCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AppSession } from "@/lib/auth/guards";
import { useSignOut } from "@/lib/auth/use-sign-out";

import { navLinksFor } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

const UserMenu = ({ session }: { session: AppSession }) => {
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="max-w-48" size="sm" variant="ghost" />}
      >
        <Avatar className="size-6">
          <AvatarFallback className="text-[10px]">
            {initials(session.user.name) || "?"}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{session.user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground truncate font-medium">
              {session.user.name}
            </span>
            <span className="truncate font-normal">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem render={<Link to="/account" />}>
            <IconUserCircle strokeWidth={1.75} />
            Mi cuenta
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={signOut.isPending}
            onClick={() => {
              signOut.mutate();
            }}
          >
            <IconLogout strokeWidth={1.75} />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SignedOutActions = () => (
  <>
    <Button
      nativeButton={false}
      render={<Link to="/sign-in" />}
      size="sm"
      variant="ghost"
    >
      Iniciar sesión
    </Button>
    <Button nativeButton={false} render={<Link to="/sign-up" />} size="sm">
      Crear cuenta
    </Button>
  </>
);

const MobileMenu = ({ session }: { session: AppSession | null }) => {
  const signOut = useSignOut();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button aria-label="Abrir el menú" size="icon" variant="ghost" />
        }
      >
        <IconMenu2 strokeWidth={1.75} />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription className="sr-only">
            Las páginas de Transipay.
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Principal" className="flex flex-col gap-1 px-4">
          <SheetClose
            className="rounded-md px-2 py-2 text-base font-medium"
            nativeButton={false}
            render={<Link to="/" />}
          >
            Inicio
          </SheetClose>
          {navLinksFor(session).map((link) => (
            <SheetClose
              className="data-[status=active]:bg-muted rounded-md px-2 py-2 text-base font-medium"
              key={link.to}
              nativeButton={false}
              render={<Link to={link.to} />}
            >
              {link.label}
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t p-4">
          {session ? (
            <>
              <p className="text-muted-foreground truncate text-sm">
                {session.user.email}
              </p>
              <SheetClose
                nativeButton={false}
                render={
                  <Button
                    nativeButton={false}
                    render={<Link to="/account" />}
                    variant="outline"
                  />
                }
              >
                Mi cuenta
              </SheetClose>
              <Button
                disabled={signOut.isPending}
                onClick={() => {
                  signOut.mutate();
                }}
                variant="ghost"
              >
                Cerrar sesión
              </Button>
            </>
          ) : (
            <>
              <SheetClose
                nativeButton={false}
                render={
                  <Button
                    nativeButton={false}
                    render={<Link to="/sign-in" />}
                    variant="outline"
                  />
                }
              >
                Iniciar sesión
              </SheetClose>
              <SheetClose
                nativeButton={false}
                render={
                  <Button
                    nativeButton={false}
                    render={<Link to="/sign-up" />}
                  />
                }
              >
                Crear cuenta
              </SheetClose>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

/** The top bar of every page. It is 64px high and stays on one line on desktop. */
export const AppHeader = ({ session }: { session: AppSession | null }) => (
  <header className="bg-background border-b">
    <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
      <Link className="shrink-0 text-base font-semibold tracking-tight" to="/">
        Transipay
      </Link>
      <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
        {navLinksFor(session).map((link) => (
          <Link
            className="text-muted-foreground hover:text-foreground data-[status=active]:text-foreground rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
            key={link.to}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <div className="hidden items-center gap-1 md:flex">
          {session ? <UserMenu session={session} /> : <SignedOutActions />}
        </div>
        <div className="md:hidden">
          <MobileMenu session={session} />
        </div>
      </div>
    </div>
  </header>
);
