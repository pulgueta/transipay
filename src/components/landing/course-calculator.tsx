import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent, ComponentProps } from "react";

import { formatAmount } from "@/lib/format-amount";

import {
  DEFAULT_PERCENT,
  MAX_PERCENT,
  MIN_PERCENT,
  clampPercent,
  coursePayment,
  formatPesosInput,
  parsePesos,
} from "./course-discount";
import { cssVars } from "./css-vars";

const DIGIT_PATTERN = /\d/gu;

// Nothing changes after React starts, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {
  // No listener to remove.
};

const countDigits = (text: string) => text.match(DIGIT_PATTERN)?.length ?? 0;

/** The index in `text` that is after `count` digits. */
const indexAfterDigits = (text: string, count: number) =>
  new RegExp(`^(?:\\D*\\d){${count}}`, "u").exec(text)?.[0].length ??
  text.length;

// The result is on the page already, so the form does not send.
const keepOnPage: NonNullable<ComponentProps<"form">["onSubmit"]> = (event) => {
  event.preventDefault();
};

interface CourseCalculatorProps {
  /** The values of a form that was sent without script (`/?valor=…&descuento=…`). */
  initialPesos?: number;
  initialPercent?: number;
}

/**
 * Finds the amount to pay for a comparendo after a course, with the rule of the server.
 * With script, the result changes as the person types. Without script, the form sends the values
 * to this page and the server shows the result.
 */
export const CourseCalculator = ({
  initialPesos,
  initialPercent,
}: CourseCalculatorProps) => {
  const [amountText, setAmountText] = useState(
    initialPesos === undefined ? "" : formatPesosInput(String(initialPesos))
  );
  const [percent, setPercent] = useState(
    clampPercent(initialPercent ?? DEFAULT_PERCENT)
  );
  // False on the server and before React starts. The parts that need script show only when it is true.
  const live = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  const amountInput = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);

  // The points move when the text is formatted. This puts the caret back after the same digit.
  useLayoutEffect(() => {
    const input = amountInput.current;
    if (input === null || caretDigits.current === null) {
      return;
    }
    const position = indexAfterDigits(amountText, caretDigits.current);
    input.setSelectionRange(position, position);
    caretDigits.current = null;
  }, [amountText]);

  const onAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value, selectionStart } = event.currentTarget;
    caretDigits.current = countDigits(
      value.slice(0, selectionStart ?? value.length)
    );
    setAmountText(formatPesosInput(value).slice(0, 14));
  };

  const pesos = parsePesos(amountText);
  const payment = pesos === null ? null : coursePayment(pesos, percent);
  const payPercent = 100 - percent;
  const figure =
    payment === null
      ? `${payPercent} %`
      : formatAmount(payment.payableInCents, "COP");

  return (
    <>
      <form
        action="/#comparendos"
        className="lp-calc"
        data-live={live ? "" : undefined}
        data-reveal
        method="get"
        noValidate={live}
        onSubmit={keepOnPage}
      >
        <div className="lp-calc-field">
          <label className="lp-calc-label" htmlFor="lp-valor">
            Valor del comparendo
          </label>
          <div className="lp-calc-money">
            <span aria-hidden>$</span>
            <input
              aria-describedby="lp-valor-help"
              autoComplete="off"
              id="lp-valor"
              inputMode="numeric"
              name="valor"
              onChange={onAmountChange}
              pattern={live ? undefined : "[0-9]*"}
              ref={amountInput}
              title="Escriba solo números."
              type="text"
              value={amountText}
            />
          </div>
          <p className="lp-calc-help" id="lp-valor-help">
            En pesos, sin centavos.
          </p>
        </div>

        <div className="lp-calc-field">
          <label className="lp-calc-label" htmlFor="lp-descuento">
            Descuento del curso
            <output htmlFor="lp-descuento">{percent} %</output>
          </label>
          <div
            className="lp-calc-range"
            style={cssVars({
              "--pay":
                1 - (percent - MIN_PERCENT) / (MAX_PERCENT - MIN_PERCENT),
            })}
          >
            <span aria-hidden className="lp-calc-pay" />
            <input
              aria-describedby="lp-descuento-help"
              id="lp-descuento"
              max={MAX_PERCENT}
              min={MIN_PERCENT}
              name="descuento"
              onChange={(event) => {
                setPercent(clampPercent(event.currentTarget.valueAsNumber));
              }}
              step={1}
              type="range"
              value={percent}
            />
          </div>
          <p className="lp-calc-help" id="lp-descuento-help">
            La sesión del curso indica el descuento, de {MIN_PERCENT} % a{" "}
            {MAX_PERCENT} %.
          </p>
        </div>

        <noscript>
          <span className="lp-btn-wrap">
            <button className="lp-btn" type="submit">
              Calcular
            </button>
          </span>
        </noscript>
      </form>

      <div aria-live="polite" className="lp-calc-result" data-reveal>
        <p
          className="lp-calc-figure"
          style={cssVars({ "--chars": Math.max(figure.length, 4) })}
        >
          {figure}
        </p>
        <p>
          {payment === null
            ? "Usted paga esta parte del valor del comparendo. Escriba el valor para ver la cifra."
            : `Es el valor a pagar. El descuento es de ${formatAmount(payment.discountInCents, "COP")}.`}
        </p>
      </div>
    </>
  );
};
