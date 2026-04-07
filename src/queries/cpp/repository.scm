; Identify data access logic
(class_specifier
  name: [
    (type_identifier) @_name
    (template_type name: (type_identifier) @_name)
  ]
  (#match? @_name "(?i)(Repository|Dao|Store|Storage|Db|Database)$")) @class

(struct_specifier
  name: [
    (type_identifier) @_name
    (template_type name: (type_identifier) @_name)
  ]
  (#match? @_name "(?i)(Repository|Dao|Store|Storage|Db|Database)$")) @struct

(namespace_definition
  name: (namespace_identifier) @_name
  (#match? @_name "(?i)(db|database|repository|dao|storage)$")) @namespace
