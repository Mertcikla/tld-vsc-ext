; Identify classes, structs, or namespaces that handle API routes
(class_specifier
  name: [
    (type_identifier) @_name
    (template_type name: (type_identifier) @_name)
  ]
  (#match? @_name "(?i)(Controller|Handler|Api|Router|Endpoint|Route)$")) @class

(struct_specifier
  name: [
    (type_identifier) @_name
    (template_type name: (type_identifier) @_name)
  ]
  (#match? @_name "(?i)(Controller|Handler|Api|Router|Endpoint|Route)$")) @struct

(namespace_definition
  name: (namespace_identifier) @_name
  (#match? @_name "(?i)(api|controllers|handlers|routes)$")) @namespace
