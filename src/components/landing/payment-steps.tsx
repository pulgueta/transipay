/**
 * The three stages of a payment. Each tile shows the real state label of that stage,
 * and the tiles grow, so the size carries the order.
 */
const STEPS = [
  {
    record: "La obligación",
    state: "Pendiente",
    title: "Busque la obligación",
    text: "Inicie sesión. Cada comparendo y cada trámite aparece con el valor a pagar.",
  },
  {
    record: "El pago",
    state: "Pago en proceso",
    title: "Pague a través de Wompi",
    text: "Presione Pagar. Wompi abre la pasarela de pago y usted elige el medio de pago.",
  },
  {
    record: "La obligación",
    state: "Pagada",
    title: "Consulte el resultado",
    text: "Transipay registra el resultado de Wompi y marca la obligación como pagada. Un pago aprobado paga la obligación una sola vez.",
  },
] as const;

export const PaymentSteps = () => (
  <section className="lp-section lp-wrap" id="pagos">
    <div className="lp-pay">
      <h2 data-reveal>Cómo funciona un pago</h2>
      <ol className="lp-steps">
        {STEPS.map((step) => (
          <li className="lp-step" key={step.title}>
            <div className="lp-tile lp-tabbed" data-reveal>
              <span className="lp-tab">{step.record}</span>
              <span className="lp-tile-word">{step.state}</span>
            </div>
            <div className="lp-step-copy" data-reveal>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  </section>
);
