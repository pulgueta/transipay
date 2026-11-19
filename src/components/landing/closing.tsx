import { ActionLink } from "./action-link";
import type { LandingActions } from "./landing-actions";
import { PUENTE, Photo } from "./photo";

/** The folder of the first screen comes back one time, large, with the action. */
export const Closing = ({ actions }: { actions: LandingActions }) => (
  <section className="lp-close">
    <div className="lp-close-copy">
      <h2 data-reveal>Póngase al día</h2>
      <p data-reveal>
        Sus comparendos y trámites de tránsito de Barrancabermeja están en un
        solo portal.
      </p>
      <p className="lp-close-fact" data-reveal>
        Tarjeta, PSE o Nequi
      </p>
      <div data-reveal>
        <ActionLink action={actions.primary} look="button" />
      </div>
    </div>
    <figure className="lp-figure lp-close-figure lp-tabbed">
      <figcaption className="lp-tab">Puente sobre el río Magdalena</figcaption>
      <Photo
        alt="Un puente largo cruza el río Magdalena en Barrancabermeja, bajo un cielo con nubes"
        photo={PUENTE}
        sizes="(min-width: 900px) 70vw, 130vw"
      />
    </figure>
  </section>
);
