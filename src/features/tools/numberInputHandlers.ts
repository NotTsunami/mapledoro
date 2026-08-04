import type { KeyboardEvent } from "react";

// Number inputs render a literal "0" at rest. Without this, a typed digit lands
// beside that zero ("0" + "5" → "05") instead of replacing it. When the field
// currently holds just "0" and a digit is pressed, select it first so the
// keystroke overwrites it — keeps the zero visible at rest while covering both
// the click-in and backspace-to-zero cases.
//
// Only "0" gets this treatment. A non-zero resting value (an Origin skill's "1")
// is a prefix the user may legitimately be extending, so selecting it there makes
// levels like 10 and 11 impossible to type.
export function replaceZeroOnDigit(e: KeyboardEvent<HTMLInputElement>) {
  if (e.currentTarget.value === "0" && e.key.length === 1 && e.key >= "0" && e.key <= "9") {
    e.currentTarget.select();
  }
}
