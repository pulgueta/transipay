import {
  IconCalendarEvent,
  IconCalendarRepeat,
  IconReceipt,
  IconSchool,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { PATHS } from "@/lib/paths";

interface Service {
  icon: Icon;
  title: string;
  description: string;
}

const SERVICES: Service[] = [
  {
    icon: IconReceipt,
    title: "Pay fines and procedures",
    description:
      "See each obligation with its amount and status. Pay it online with a card, PSE, or Nequi through Wompi.",
  },
  {
    icon: IconCalendarEvent,
    title: "Book an appointment",
    description:
      "Choose a date and time at the ITTB, a CDA, or a CEA. Cancel it from the same page if your plans change.",
  },
  {
    icon: IconSchool,
    title: "Take a course for a fine discount",
    description:
      "Enroll in a pedagogical course at a CEA. The discount applies to the fine when you complete it.",
  },
  {
    icon: IconCalendarRepeat,
    title: "Pay in installments",
    description:
      "When the ITTB approves a payment agreement, pay each installment on its date from your obligations.",
  },
];

const PAYMENT_STEPS = [
  {
    title: "Find the obligation",
    description:
      "Sign in with your document. Your fines and procedures appear with the amount due.",
  },
  {
    title: "Pay through Wompi",
    description:
      "Press Pay. Wompi opens the checkout, and you choose the payment method.",
  },
  {
    title: "See the result",
    description:
      "Transipay records the result from Wompi and marks the obligation as paid. You can check the status at any time.",
  },
];

const ENTITIES = [
  "ITTB, the transit authority",
  "CDAs, the inspection centers",
  "CEAs, the driving schools",
  "Collectors",
];

const Hero = ({ signedIn }: { signedIn: boolean }) => (
  <section className="grid items-center gap-10 py-8 lg:grid-cols-12 lg:py-16">
    <div className="flex flex-col gap-6 lg:col-span-6">
      <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
        Pay your transit obligations in Barrancabermeja online
      </h1>
      <p className="text-muted-foreground max-w-[50ch] text-lg">
        Find your fines and procedures, book an appointment, and pay from one
        place. One portal for all transit entities.
      </p>
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <>
            <Button
              nativeButton={false}
              render={<Link to={PATHS.obligations} />}
              size="lg"
            >
              Find my obligations
            </Button>
            <Button
              nativeButton={false}
              render={<Link to={PATHS.appointments} />}
              size="lg"
              variant="outline"
            >
              Book an appointment
            </Button>
          </>
        ) : (
          <>
            <Button
              nativeButton={false}
              render={
                <Link search={{ redirect: PATHS.obligations }} to="/sign-in" />
              }
              size="lg"
            >
              Find my obligations
            </Button>
            <Button
              nativeButton={false}
              render={<Link to="/sign-up" />}
              size="lg"
              variant="outline"
            >
              Create account
            </Button>
          </>
        )}
      </div>
    </div>
    <div className="lg:col-span-6">
      {/* Placeholder photo until the ITTB gives one. 4:3 keeps the space while it loads. */}
      <img
        alt="A street with cars and motorcycles in Barrancabermeja"
        className="aspect-4/3 w-full rounded-lg border object-cover"
        fetchPriority="high"
        height={900}
        src="https://picsum.photos/seed/transipay-barrancabermeja-transit/1200/900"
        width={1200}
      />
    </div>
  </section>
);

const Services = () => (
  <section className="flex flex-col gap-10 py-16">
    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
      What you can do here
    </h2>
    <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {SERVICES.map((service) => (
        <li className="flex gap-4" key={service.title}>
          <service.icon
            aria-hidden
            className="text-primary mt-0.5 size-6 shrink-0"
            strokeWidth={1.75}
          />
          <div className="flex flex-col gap-1">
            <h3 className="font-medium">{service.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {service.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

const HowPaymentWorks = () => (
  <section className="grid gap-8 border-t py-16 lg:grid-cols-12">
    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl lg:col-span-4">
      How a payment works
    </h2>
    <ol className="flex flex-col divide-y lg:col-span-8">
      {PAYMENT_STEPS.map((step) => (
        <li className="flex flex-col gap-1 py-5 first:pt-0" key={step.title}>
          <h3 className="font-medium">{step.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  </section>
);

const TrustStrip = () => (
  <section className="flex flex-col gap-4 border-t py-10">
    <p className="text-sm font-medium">The entities that work in Transipay</p>
    <ul className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-2 text-sm">
      {ENTITIES.map((entity) => (
        <li key={entity}>{entity}</li>
      ))}
    </ul>
  </section>
);

const Home = () => {
  const { session } = Route.useRouteContext();

  return (
    <>
      <Hero signedIn={session !== null} />
      <Services />
      <HowPaymentWorks />
      <TrustStrip />
    </>
  );
};

export const Route = createFileRoute("/")({ component: Home });
