import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
  it("renders the sent amount without points, so the form can send it again without script", () => {
    const input = serverAmountInput(621_600);

    expect(input.value).toBe("621600");
    expect(
      new RegExp(`^(?:${input.pattern})$`, "u").test(input.value)
    ).toBeTruthy();
  });
});
