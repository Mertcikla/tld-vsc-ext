; Awaited method call where the method is a standard DB operation verb
(await_expression
  (call_expression
    function: (member_expression
      property: (property_identifier) @_m
      (#match? @_m "^(query|exec|find|findOne|findAll|findById|findBy|findAndCount|where|select|insert|update|delete|save|create|upsert|raw|execute|run|prepare|transaction|begin|commit|rollback|count|aggregate|lookup|pipeline|connect|disconnect)$"))))

; Property access on a field named db/pool/conn/repository/store/client
(member_expression
  object: (identifier) @_field
  (#match? @_field "^(db|pool|conn|connection|repository|repo|store|client|prisma|knex|sequelize|mongoose|orm)$")
  property: (property_identifier) @_method)
