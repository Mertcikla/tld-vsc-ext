; Function with attribute macro containing HTTP verb (axum, actix-web, rocket, warp)
(function_item
  (attribute_item
    (attribute
      (identifier) @_attr
      (#match? @_attr "^(get|post|put|patch|delete|head|options|route|handler|endpoint)$")))
  @fn)

; Function whose parameter type contains Request or Context
(function_item
  parameters: (parameters
    (parameter
      pattern: (_)
      type: (reference_type
        type: (generic_type
          type: (type_identifier) @_t
          (#match? @_t "^(Request|HttpRequest|Context|State|Extension)$")))))
  @fn)
