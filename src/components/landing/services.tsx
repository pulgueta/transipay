import { CRISTO, Photo } from "./photo";

/** What a citizen can do in the app. Each point is a real page or rule of the product. */
const POINTS = [
  {
    title: "Vea cada obligación",
    text: "Cada comparendo y cada trámite aparece con su valor y su estado.",
  },
  {
    title: "Pague en línea",
    text: "Pague con tarjeta, PSE o Nequi. Wompi procesa el pago.",
  },
  {
    title: "Tome un curso",
    text: "Asista a un curso de seguridad vial en un CEA. El descuento baja el valor del comparendo.",
  },
  {
    title: "Agende una cita",
    text: "Elija la entidad, la sede, el trámite, la fecha y la hora.",
  },
  {
    title: "Cancele la cita",
    text: "Si sus planes cambian, cancele la cita antes de la hora programada.",
  },
  {
    title: "Pague por cuotas",
    text: "Cuando el ITTB aprueba un acuerdo de pago, pague cada cuota en su fecha.",
  },
  {
    title: "Consulte el pago",
    text: "Vea el resultado de cada pago. Si el estado no cambia, presione Actualizar estado.",
  },
  {
    title: "Use su documento",
    text: "Agregue su documento a la cuenta. Transipay muestra las obligaciones de ese documento.",
  },
  {
    title: "Solo sus datos",
    text: "Cada persona ve solo sus obligaciones, sus citas y sus pagos.",
  },
] as const;

export const Services = () => (
  <section className="lp-section lp-wrap" id="servicios">
    <div className="lp-services-grid">
      <figure className="lp-figure lp-services-figure lp-tabbed" data-reveal>
        <figcaption className="lp-tab">Cristo Petrolero</figcaption>
        <Photo
          alt="La escultura del Cristo Petrolero sobre el agua de una ciénaga de Barrancabermeja, con la refinería al fondo"
          photo={CRISTO}
          sizes="(min-width: 900px) 40vw, 82vw"
        />
      </figure>
      <div className="lp-services-copy">
        <h2 data-reveal>Lo que puede hacer</h2>
        <ul className="lp-points">
          {POINTS.map((point) => (
            <li className="lp-point" data-reveal key={point.title}>
              <span aria-hidden className="lp-mark" />
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);
