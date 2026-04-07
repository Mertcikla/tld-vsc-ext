; Method with annotation containing HTTP verb or mapping keyword
(method_declaration
  (modifiers
    (annotation
      name: (identifier) @_ann
      (#match? @_ann "^(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping|Path|GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$")))
  @method)

; Class annotated as Controller/RestController/Resource
(class_declaration
  (modifiers
    (annotation
      name: (identifier) @_ann
      (#match? @_ann "^(Controller|RestController|Resource|Api|RequestScoped|WebServlet)$")))
  @class)
