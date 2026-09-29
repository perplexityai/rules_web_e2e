// This TS template uses JavaScript-compatible syntax; Bazel substitutes JSON data.
const options = JSON.parse("__RULES_WEB_E2E_MATCHING_OPTIONS__")
export default Object.fromEntries(
  Object.keys(options).map(name => [name, JSON.parse(options[name])])
)
