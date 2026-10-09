import { createFileRoute } from "@tanstack/react-router";

const Home = () => (
  <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-3 p-6">
    <h1 className="text-2xl font-semibold tracking-tight">Transipay</h1>
    <p className="text-muted-foreground">
      One portal for the transit entities of Barrancabermeja. Find your fines
      and procedures, book appointments, and pay online.
    </p>
  </main>
);

export const Route = createFileRoute("/")({ component: Home });
