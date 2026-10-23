/** Shared stacking order for tool surfaces, so sticky bars and dropdowns
 *  don't collide with arbitrary one-off z-index values. Ordered low to high:
 *  content < sticky < dropdown. Modals are native <dialog>s in the top layer. */
export const Z = {
  sticky: 10,
  dropdown: 20,
} as const;
