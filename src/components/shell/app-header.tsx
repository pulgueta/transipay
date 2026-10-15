import { IconLogout, IconMenu2, IconUserCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";

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
import { isStaff } from "@/lib/auth/roles";
import { useSignOut } from "@/lib/auth/use-sign-out";

import { ThemeToggle } from "./theme-toggle";

interface NavLink {
  to: LinkProps["to"];
  label: string;
}

/** The pages of a signed-in citizen. */
const CITIZEN_LINKS: NavLink[] = [
  { to: "/obligations", label: "Obligations" },
  { to: "/appointments", label: "Appointments" },
  { to: "/courses", label: "Courses" },
];

const STAFF_LINK: NavLink = { to: "/staff", label: "Staff" };

const navLinks = (session: AppSession | null) => {
  if (!session) {
    return [];
  }
  return isStaff(session.user.role)
    ? [...CITIZEN_LINKS, STAFF_LINK]
    : [...CITIZEN_LINKS];
};

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
            Account
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
            Sign out
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
      Sign in
    </Button>
    <Button nativeButton={false} render={<Link to="/sign-up" />} size="sm">
      Create account
    </Button>
  </>
);

const MobileMenu = ({ session }: { session: AppSession | null }) => {
  const signOut = useSignOut();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button aria-label="Open the menu" size="icon" variant="ghost" />
        }
      >
        <IconMenu2 strokeWidth={1.75} />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">
            The pages of Transipay.
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col gap-1 px-4">
          <SheetClose
            className="rounded-md px-2 py-2 text-base font-medium"
            nativeButton={false}
            render={<Link to="/" />}
          >
            Home
          </SheetClose>
          {navLinks(session).map((link) => (
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
                  <Button render={<Link to="/account" />} variant="outline" />
                }
              >
                Account
              </SheetClose>
              <Button
                disabled={signOut.isPending}
                onClick={() => {
                  signOut.mutate();
                }}
                variant="ghost"
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <SheetClose
                nativeButton={false}
                render={
                  <Button render={<Link to="/sign-in" />} variant="outline" />
                }
              >
                Sign in
              </SheetClose>
              <SheetClose
                nativeButton={false}
                render={<Button render={<Link to="/sign-up" />} />}
              >
                Create account
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
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {navLinks(session).map((link) => (
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
