; Method call on self.db / self.session / self.conn / self.cursor
(call
  function: (attribute
    object: (attribute
      object: (identifier) @_self
      (#eq? @_self "self")
      attribute: (identifier) @_field
      (#match? @_field "^(db|session|conn|connection|cursor|store|client|engine|pool)$"))
    attribute: (identifier) @_method
    (#match? @_method "^(query|execute|find|find_one|find_all|insert|update|delete|save|commit|rollback|begin|filter|exclude|create|get|all|bulk_create|bulk_update|select|raw|scalar|fetchone|fetchall|fetchmany)$")))

; Django ORM: Model.objects.filter()/create()/get()
(call
  function: (attribute
    object: (attribute
      attribute: (identifier) @_manager
      (#eq? @_manager "objects"))
    attribute: (identifier) @_method
    (#match? @_method "^(filter|exclude|get|create|update|delete|all|bulk_create|bulk_update|select_related|prefetch_related|annotate|aggregate|count|exists|first|last|raw)$")))
