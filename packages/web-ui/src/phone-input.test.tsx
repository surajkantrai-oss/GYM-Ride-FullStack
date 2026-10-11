// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CountryPhoneInput } from "./index";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <CountryPhoneInput value={value} onChange={setValue} />
      <output data-testid="normalized">{value}</output>
    </>
  );
}

afterEach(cleanup);

describe("CountryPhoneInput", () => {
  it("defaults to India and normalizes a local number to E.164", () => {
    render(<Harness />);
    expect(
      (screen.getByLabelText("Country or dialing code") as HTMLInputElement).value,
    ).toContain("India (+91)");
    fireEvent.change(screen.getByLabelText("Local mobile number"), {
      target: { value: "9876543210" },
    });
    expect(screen.getByTestId("normalized").textContent).toBe("+919876543210");
  });

  it("keeps partial digits visible while the user types", () => {
    const view = render(<Harness />);
    const input = view.getByLabelText("Local mobile number") as HTMLInputElement;
    for (const partial of ["9", "98", "987", "9876"]) {
      fireEvent.change(input, { target: { value: partial } });
      expect(input.value).toBe(partial);
    }
    expect(view.getByTestId("normalized").textContent).toBe("+919876");
  });
});
