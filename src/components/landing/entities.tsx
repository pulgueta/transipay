/** The four kinds of entity in the app (`ENTITY_KINDS` in the schema). */
const ENTITIES = [
  {
    name: "ITTB",
    detail:
      "Inspección de Tránsito y Transporte de Barrancabermeja. Es la autoridad de tránsito.",
  },
  { name: "CDA", detail: "Los centros de diagnóstico automotor." },
  {
    name: "CEA",
    detail: "Los centros de enseñanza automovilística. Dan los cursos.",
  },
  {
    name: "Recaudadores",
    detail: "Las entidades que recaudan los pagos de tránsito.",
  },
] as const;

export const Entities = () => (
  <section aria-labelledby="lp-entidades" className="lp-wrap" id="entidades">
    <h2 className="sr-only" id="lp-entidades">
      Las entidades de Transipay
    </h2>
    <ul className="lp-poster">
      {ENTITIES.map((entity) => (
        <li className="lp-poster-row" data-reveal key={entity.name}>
          <span className="lp-poster-name">{entity.name}</span>
          <span className="lp-poster-detail">{entity.detail}</span>
        </li>
      ))}
    </ul>
  </section>
);
