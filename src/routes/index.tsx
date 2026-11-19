import jostLatin from "@fontsource-variable/jost/files/jost-latin-wght-normal.woff2?url";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

import { Closing } from "@/components/landing/closing";
import { calculatorSearchSchema } from "@/components/landing/course-discount";
import { CourseSection } from "@/components/landing/course-section";
import { Entities } from "@/components/landing/entities";
import { Hero } from "@/components/landing/hero";
import { landingActionsFor } from "@/components/landing/landing-actions";
import { PaymentSteps } from "@/components/landing/payment-steps";
import { Questions } from "@/components/landing/questions";
import { RiverBand } from "@/components/landing/river-band";
import { Services } from "@/components/landing/services";
import { useReveal } from "@/components/landing/use-reveal";

const Home = () => {
  const { session } = Route.useRouteContext();
  const { valor, descuento } = Route.useSearch();
  const actions = landingActionsFor(session);
  const page = useRef<HTMLDivElement>(null);
  useReveal(page);

  return (
    <div className="lp" id="inicio" ref={page}>
      <Hero actions={actions} />
      <CourseSection
        coursesAction={actions.courses}
        initialPercent={descuento}
        initialPesos={valor}
      />
      <Services />
      <PaymentSteps />
      <RiverBand />
      <Entities />
      <Questions />
      <Closing actions={actions} />
    </div>
  );
};

export const Route = createFileRoute("/")({
  validateSearch: calculatorSearchSchema,
  head: () => ({
    meta: [
      {
        title:
          "Transipay: comparendos y trámites de tránsito de Barrancabermeja",
      },
      {
        name: "description",
        content:
          "Consulte y pague sus comparendos y trámites de tránsito de Barrancabermeja. Agende una cita y tome un curso para obtener descuento.",
      },
    ],
    links: [
      // The one font file of the first screen. The stylesheet asks for the same file.
      {
        rel: "preload",
        href: jostLatin,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: Home,
});
