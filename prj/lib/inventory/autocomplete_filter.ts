// GENERATED ONCE — safe to edit (will not be overwritten on regeneration)
// Autocomplete candidate filter for inventory.
//
// filterAutocompleteOptions() returns a WHERE contribution that is ANDed
// after the existing authorization (accessAnd) and search-token (matchOr)
// clauses inside searchInventoryOptions() — it can only NARROW the
// candidate set, never widen or replace the authorization scope.
//
// WARNING: `context.formValues` is untrusted client input. Use it only to
// narrow results (e.g. filter by a sibling FK selected in the same form).
// Never use it to widen the result set or to bypass authorization.
export type AutocompleteFilterContext = {
  callerEntity?: string;
  formValues?: Record<string, unknown>;
};

export function filterAutocompleteOptions(
  context: AutocompleteFilterContext,
): Record<string, unknown> {
  // receiving_receipt_line's split action (cmd_424): narrow inventory
  // candidates to the same product as the line being split, so the picker
  // doesn't offer inventory rows for unrelated products.
  const productId = context.formValues?.product_id;
  if (typeof productId === 'string' && productId.length > 0) {
    return { product_id: productId };
  }
  return {};
}
