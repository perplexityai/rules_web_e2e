// Bazel substitutes the declared string options; runtime validation owns ranges.
const options = __RULES_WEB_E2E_MATCHING_OPTIONS__
export default Object.fromEntries(
  Object.entries(options).map(([name, value]) => [name, JSON.parse(value)])
)
