import {
  IconCalendarEvent,
  IconCalendarRepeat,
  IconReceipt,
  IconSchool,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

interface Service {
  icon: Icon;
  title: string;
  description: string;
}

const SERVICES: Service[] = [
  {
    icon: IconReceipt,
    title: "Pague comparendos y trámites",
    description:
      "Vea cada obligación con su valor y estado. Páguela en línea con tarjeta, PSE o Nequi a través de Wompi.",
  },
  {
    icon: IconCalendarEvent,
    title: "Agende una cita",
    description:
      "Elija fecha y hora en el ITTB, un CDA o un CEA. Si sus planes cambian, cancélela desde la misma página.",
  },
  {
    icon: IconSchool,
    title: "Tome un curso para obtener descuento en su comparendo",
    description:
      "Inscríbase en un curso de seguridad vial en un CEA. El descuento se aplica al comparendo cuando usted asiste.",
  },
  {
    icon: IconCalendarRepeat,
    title: "Pague por cuotas",
    description:
      "Cuando el ITTB aprueba un acuerdo de pago, pague cada cuota en su fecha desde sus obligaciones.",
  },
];

const PAYMENT_STEPS = [
  {
    title: "Busque la obligación",
    description:
      "Inicie sesión con su correo y contraseña. Sus comparendos y trámites aparecen con el valor a pagar.",
  },
  {
    title: "Pague a través de Wompi",
    description:
      "Presione Pagar. Wompi abre la pasarela de pago y usted elige el medio de pago.",
  },
  {
    title: "Consulte el resultado",
    description:
      "Transipay registra el resultado de Wompi y marca la obligación como pagada. Puede consultar el estado en cualquier momento.",
  },
];

const ENTITIES = [
  "ITTB, la autoridad de tránsito",
  "CDA, los centros de diagnóstico automotor",
  "CEA, las escuelas de conducción",
  "Recaudadores",
];

const Hero = ({ signedIn }: { signedIn: boolean }) => (
  <section className="grid items-center gap-10 py-8 lg:grid-cols-12 lg:py-16">
    <div className="flex flex-col gap-6 lg:col-span-6">
      <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
        Pague en línea sus obligaciones de tránsito en Barrancabermeja
      </h1>
      <p className="text-muted-foreground max-w-[50ch] text-lg">
        Consulte sus comparendos y trámites, agende una cita y pague desde un
        solo lugar. Un portal para todas las entidades de tránsito.
      </p>
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <>
            <Button
              nativeButton={false}
              render={<Link to="/obligations" />}
              size="lg"
            >
              Consultar mis obligaciones
            </Button>
            <Button
              nativeButton={false}
              render={<Link to="/appointments" />}
              size="lg"
              variant="outline"
            >
              Agendar una cita
            </Button>
          </>
        ) : (
          <>
            <Button
              nativeButton={false}
              render={
                <Link search={{ redirect: "/obligations" }} to="/sign-in" />
              }
              size="lg"
            >
              Consultar mis obligaciones
            </Button>
            <Button
              nativeButton={false}
              render={<Link to="/sign-up" />}
              size="lg"
              variant="outline"
            >
              Crear cuenta
            </Button>
          </>
        )}
      </div>
    </div>
    <div className="lg:col-span-6">
      {/* Placeholder photo until the ITTB gives one. 4:3 keeps the space while it loads. */}
      <img
        alt="Una vía con vehículos"
        className="aspect-4/3 w-full rounded-lg border object-cover"
        fetchPriority="high"
        height={900}
        src="https://picsum.photos/seed/transipay-road-traffic-07/1200/900"
        width={1200}
      />
    </div>
  </section>
);

const Services = () => (
  <section className="flex flex-col gap-10 py-16">
    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
      Lo que puede hacer aquí
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
      Cómo funciona un pago
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
    <p className="text-sm font-medium">
      Las entidades que trabajan en Transipay
    </p>
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
