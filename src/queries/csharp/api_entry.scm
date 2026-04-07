; Method with HTTP verb attribute
(method_declaration
  (attribute_list
    (attribute
      name: (identifier) @_attr
      (#match? @_attr "^(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|HttpHead|HttpOptions|Route|ApiRoute|MapGet|MapPost|MapPut|MapPatch|MapDelete)$")))
  @method)

; Class with [ApiController] or [Controller]
(class_declaration
  (attribute_list
    (attribute
      name: (identifier) @_attr
      (#match? @_attr "^(ApiController|Controller|Route|MinimalApi)$")))
  @class)
