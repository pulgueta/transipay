import {
  IconCalendarEvent,
  IconCalendarRepeat,
  IconReceipt,
  IconSchool,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { canUser } from "@/lib/auth/permissions";

interface Service {
  icon: Icon;
  title: string;
  description: string;
}

const SERVICES: Service[] = [
  {
    icon: IconReceipt,
    title: "Pague con tarjeta, PSE o Nequi",
    description:
      "Vea cada comparendo y trámite con su valor y su estado. Wompi procesa el pago.",
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

interface HeroProps {
  signedIn: boolean;
  /** False for a role that cannot book (for example, a cashier). */
  canBook: boolean;
}

const Hero = ({ signedIn, canBook }: HeroProps) => (
  <section className="grid items-center gap-10 py-8 lg:grid-cols-12 lg:py-16">
    <div className="flex flex-col gap-6 lg:col-span-6">
      <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
        Pague comparendos y trámites
      </h1>
      <p className="text-muted-foreground max-w-[50ch] text-lg">
        Consulte sus obligaciones de tránsito en Barrancabermeja, agende una
        cita y pague en línea. Un solo portal para el ITTB, los CDA, los CEA y
        los recaudadores.
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
            {canBook ? (
              <Button
                nativeButton={false}
                render={<Link to="/appointments" />}
                size="lg"
                variant="outline"
              >
                Agendar una cita
              </Button>
            ) : null}
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
    {/* A photo of Barrancabermeja from Wikimedia Commons until the ITTB gives its own. The licence needs the credit below the photo. */}
    <figure className="flex flex-col gap-2 lg:col-span-6">
      <img
        alt="La Avenida del Ferrocarril en Barrancabermeja, con motos parqueadas junto al Parque Camilo Torres"
        className="aspect-4/3 w-full rounded-lg object-cover"
        fetchPriority="high"
        height={1036}
        src="/images/avenida-del-ferrocarril-barrancabermeja.jpg"
        width={1280}
      />
      <figcaption className="text-muted-foreground text-sm">
        Foto:{" "}
        <a
          className="hover:text-foreground underline underline-offset-4"
          href="https://commons.wikimedia.org/wiki/File:Avenida_del_Ferrocarril_y_Parque_Camilo_Torres.jpg"
        >
          Avenida del Ferrocarril y Parque Camilo Torres
        </a>
        , de Miguel9201,{" "}
        <a
          className="hover:text-foreground underline underline-offset-4"
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.es"
        >
          CC BY-SA 4.0
        </a>
        , en Wikimedia Commons.
      </figcaption>
    </figure>
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
            <p className="text-muted-foreground leading-relaxed">
              {service.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

const HowPaymentWorks = () => (
  <section className="grid gap-8 py-16 lg:grid-cols-12">
    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl lg:col-span-4">
      Cómo funciona un pago
    </h2>
    <ol className="flex flex-col gap-8 lg:col-span-8">
      {PAYMENT_STEPS.map((step) => (
        <li className="flex flex-col gap-1" key={step.title}>
          <h3 className="font-medium">{step.title}</h3>
          <p className="text-muted-foreground leading-relaxed">
            {step.description}
          </p>
        </li>
      ))}
    </ol>
  </section>
);

const TrustStrip = () => (
  <section className="flex flex-col gap-4 py-10">
    <p className="font-medium">Las entidades que trabajan en Transipay</p>
    <ul className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-2">
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
      <Hero
        canBook={canUser(session?.user.role, { appointment: ["create"] })}
        signedIn={session !== null}
      />
      <Services />
      <HowPaymentWorks />
      <TrustStrip />
    </>
  );
};

export const Route = createFileRoute("/")({ component: Home });
