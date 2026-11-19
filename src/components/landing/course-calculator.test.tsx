import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { CourseCalculator } from "./course-calculator";

/** The amount input of the calculator, as the server renders it for a page without script. */
const serverAmountInput = (initialPesos: number) => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <CourseCalculator initialPercent={37} initialPesos={initialPesos} />
  );
  const input = container.querySelector<HTMLInputElement>("#lp-valor");
  if (input === null) {
    throw new Error("The amount input is not on the page.");
  }
  return input;
};

describe(CourseCalculator, () => {
  afterEach(cleanup);

  it.each(["621.600,50", "621600.5", "$ 621.600"])(
    "keeps the whole pesos when a person pastes %s",
    (pasted) => {
      render(<CourseCalculator />);
      const input = screen.getByLabelText("Valor del comparendo");

      fireEvent.paste(input, {
        clipboardData: { getData: () => pasted },
      });

      expect(input).toHaveProperty("value", "621.600");
    }
  );

  it.each(["0,50", "0.5", "abc"])(
    "adds no pesos when a person pastes %s",
    (pasted) => {
      render(<CourseCalculator />);
      const input = screen.getByLabelText("Valor del comparendo");

      // False when the calculator stops the browser from pasting the text as it is.
      const pastedAsItIs = fireEvent.paste(input, {
        clipboardData: { getData: () => pasted },
      });

      expect(pastedAsItIs).toBeFalsy();
      expect(input).toHaveProperty("value", "");
    }
  );

  it("renders the sent amount without points, so the form can send it again without script", () => {
    const input = serverAmountInput(621_600);

    expect(input.value).toBe("621600");
    expect(
      new RegExp(`^(?:${input.pattern})$`, "u").test(input.value)
    ).toBeTruthy();
  });
});
