import { cssVars } from "./css-vars";

/** Each answer states a rule of the product. `topic` is the word on the tab of the card. */
const QUESTIONS = [
  {
    topic: "RUNT y SIMIT",
    question: "¿Transipay reemplaza al RUNT o al SIMIT?",
    answer:
      "No. Transipay es el portal del tránsito de Barrancabermeja. No reemplaza al RUNT ni al SIMIT.",
  },
  {
    topic: "Wompi",
    question: "¿Quién procesa el pago?",
    answer:
      "Wompi procesa el pago. Transipay no procesa la transacción de su tarjeta. Transipay registra el resultado que Wompi informa.",
  },
  {
    topic: "Estado",
    question: "Pagué y el estado no cambia. ¿Qué hago?",
    answer:
      "Abra la página del pago y presione Actualizar estado. Transipay consulta el pago en Wompi y registra el resultado. Un pago aprobado paga la obligación una sola vez.",
  },
  {
    topic: "Descuento",
    question: "¿Cómo obtengo el descuento del curso?",
    answer:
      "Inscríbase en una sesión abierta y elija el comparendo. Asista al curso. Transipay aplica el descuento a ese comparendo, una sola vez, si aún está pendiente.",
  },
  {
    topic: "Citas",
    question: "¿Puedo cancelar una cita?",
    answer:
      "Sí. Cancele una cita programada antes de su hora. Agende cada cita con una hora o más de anticipación.",
  },
  {
    topic: "Cuotas",
    question: "¿Puedo pagar por cuotas?",
    answer:
      "Sí, cuando el ITTB aprueba un acuerdo de pago. Pague cada cuota en su fecha. La obligación queda pagada cuando todas las cuotas estén pagadas.",
  },
] as const;

/**
 * Questions as index cards in a drawer. `name` makes the browser keep one card open,
 * so the cards work without script.
 */
export const Questions = () => (
  <section className="lp-section lp-wrap lp-faq" id="preguntas">
    <div className="lp-faq-inner">
      <h2 data-reveal>Preguntas frecuentes</h2>
      <div className="lp-cards">
        {QUESTIONS.map((item, index) => (
          <details
            className="lp-card lp-tabbed"
            data-reveal
            key={item.topic}
            name="lp-preguntas"
            open={index === 0}
            style={cssVars({ "--n": index })}
          >
            <summary>
              <span className="lp-tab">{item.topic}</span>
              {item.question}
            </summary>
            <p className="lp-card-answer">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);
