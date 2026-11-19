import { Photo, REFINERIA } from "./photo";

/** One full-width picture between the two halves of the page. */
export const RiverBand = () => (
  <figure className="lp-figure lp-band lp-tabbed">
    <figcaption className="lp-tab">
      La refinería, desde el río Magdalena
    </figcaption>
    <Photo
      alt="La refinería de Barrancabermeja y sus tanques detrás de los árboles de la orilla, vista desde el río Magdalena"
      photo={REFINERIA}
      sizes="100vw"
    />
  </figure>
);
