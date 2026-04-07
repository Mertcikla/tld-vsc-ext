; Identify business logic services
(class_specifier
  name: [
    (type_identifier) @_name
    (template_type name: (type_identifier) @_name)
  ]
  (#match? @_name "(?i)(Service|Manager|Processor|UseCase|Domain|Application)$")) @class

(struct_specifier
  name: [
    (type_identifier) @_name
    (template_type name: (type_identifier) @_name)
  ]
  (#match? @_name "(?i)(Service|Manager|Processor|UseCase|Domain|Application)$")) @struct

(namespace_definition
  name: (namespace_identifier) @_name
  (#match? @_name "(?i)(services|usecases|domain|application|managers)$")) @namespace
