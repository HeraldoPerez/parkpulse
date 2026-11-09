import { useId, useMemo, useRef, useState } from "react";
import { MAX_PARKS } from "../lib/selection.js";
import { searchParks } from "../lib/search.js";

/**
 * Search box for adding parks, with the picked parks shown as removable chips.
 * Works with the keyboard: arrows to move, Enter to add, Escape to close,
 * Backspace in an empty box to remove the last park.
 */
export function ParkPicker({ parks, selected, onChange, max = MAX_PARKS }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const inputId = useId();
  const listId = useId();
  const hintId = useId();

  const byCode = useMemo(() => new Map(parks.map((park) => [park.code, park])), [parks]);
  const matches = useMemo(() => searchParks(parks, query, selected), [parks, query, selected]);
  const full = selected.length >= max;
  const showList = open && matches.length > 0;
  const activeIndex = Math.min(active, matches.length - 1);

  function add(code) {
    onChange([...selected, code]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(code) {
    onChange(selected.filter((c) => c !== code));
    inputRef.current?.focus();
  }

  function onKeyDown(event) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActive((i) => Math.min(i + 1, matches.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (showList) {
          event.preventDefault();
          add(matches[activeIndex].code);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Backspace":
        if (query === "" && selected.length > 0) remove(selected[selected.length - 1]);
        break;
    }
  }

  return (
    <div className="picker">
      <label className="picker-label" htmlFor={inputId}>
        Parks on your trip
      </label>

      {selected.length > 0 && (
        <ul className="chips" aria-label="Picked parks">
          {selected.map((code) => {
            const name = byCode.get(code)?.name ?? code.toUpperCase();
            return (
              <li key={code} className="chip">
                <span>{name}</span>
                <button type="button" className="chip-remove" aria-label={`Remove ${name}`} onClick={() => remove(code)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="combo">
        <input
          ref={inputRef}
          id={inputId}
          className="combo-input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-describedby={hintId}
          aria-activedescendant={showList ? `${listId}-${matches[activeIndex].code}` : undefined}
          placeholder={full ? `That's ${max} parks, the most at once` : "Search by name, state or park code"}
          disabled={full}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" className="combo-list" aria-label="Matching parks" hidden={!showList}>
          {showList &&
            matches.map((park, index) => (
              <li
                key={park.code}
                id={`${listId}-${park.code}`}
                role="option"
                aria-selected={index === activeIndex}
                className="combo-option"
                // Keep focus in the input so the list doesn't close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => add(park.code)}
              >
                <span className="option-name">{park.fullName}</span>
                <span className="option-meta">
                  {statesLabel(park.states)} · {park.code}
                </span>
              </li>
            ))}
        </ul>
        {open && query.trim() !== "" && matches.length === 0 && (
          <p className="combo-empty" role="status">
            No parks match “{query.trim()}”.
          </p>
        )}
      </div>
      <p id={hintId} className="picker-hint">
        {full
          ? "Remove a park to add another."
          : `Pick up to ${max}. The link in your address bar opens this same list.`}
      </p>
    </div>
  );
}

/** Long trails cross a dozen states, so show the first few: "CA, CO, ID +7". */
export function statesLabel(states) {
  return states.length > 4 ? `${states.slice(0, 3).join(", ")} +${states.length - 3}` : states.join(", ");
}
