import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { parks } from "../test/data.js";
import { ParkPicker, statesLabel } from "./ParkPicker.jsx";

function Harness({ initial = [], max, onChange = () => {} }) {
  const [selected, setSelected] = useState(initial);
  return (
    <ParkPicker
      parks={parks}
      selected={selected}
      max={max}
      onChange={(codes) => {
        setSelected(codes);
        onChange(codes);
      }}
    />
  );
}

const input = () => screen.getByRole("combobox", { name: "Parks on your trip" });

describe("ParkPicker", () => {
  test("typing shows matching parks and clicking one adds it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(input(), "yell");
    await user.click(screen.getByRole("option", { name: /Yellowstone National Park/ }));

    expect(onChange).toHaveBeenLastCalledWith(["yell"]);
    expect(screen.getByRole("list", { name: "Picked parks" })).toHaveTextContent("Yellowstone");
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
  });

  test("works with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(input(), "ut");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Arches"),
      expect.stringContaining("Zion"),
      expect.stringContaining("Cedar Breaks"),
    ]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["zion"]);
  });

  test("Escape closes the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "grand");
    expect(screen.getByRole("listbox", { hidden: true })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  test("says when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "atlantis");
    expect(screen.getByRole("status")).toHaveTextContent("No parks match “atlantis”.");
  });

  test("parks already picked aren't offered again", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["zion"]} />);
    await user.type(input(), "ut");
    expect(screen.queryByRole("option", { name: /Zion/ })).not.toBeInTheDocument();
  });

  test("the × button removes a park", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["yell", "zion"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Remove Yellowstone" }));
    expect(onChange).toHaveBeenLastCalledWith(["zion"]);
  });

  test("Backspace in an empty box removes the last park", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["yell", "zion"]} onChange={onChange} />);
    await user.click(input());
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenLastCalledWith(["yell"]);
  });

  test("long state lists are shortened", () => {
    expect(statesLabel(["UT"])).toBe("UT");
    expect(statesLabel(["CO", "UT", "WY", "ID"])).toBe("CO, UT, WY, ID");
    expect(statesLabel(["CA", "CO", "ID", "KS", "MO", "NE", "NV", "OR", "UT", "WY"])).toBe("CA, CO, ID +7");
  });

  test("stops at the maximum", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["yell"]} max={2} />);
    await user.type(input(), "zion");
    await user.keyboard("{Enter}");
    expect(input()).toBeDisabled();
    expect(screen.getByText("Remove a park to add another.")).toBeInTheDocument();
  });
});
