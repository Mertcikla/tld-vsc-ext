; Class implementing or extending a repository/DAO interface
(class_declaration
  (super_interfaces
    (type_list
      (type_identifier) @_iface
      (#match? @_iface "^(Repository|CrudRepository|JpaRepository|MongoRepository|DAO|Dao|DataStore)$")))
  @class)

; Method invocation on a field named entityManager/session/jdbcTemplate/namedParameterJdbcTemplate
(method_invocation
  object: (field_access
    field: (identifier) @_field
    (#match? @_field "^(entityManager|session|jdbcTemplate|namedJdbcTemplate|template|repository|dao|store)$"))
  name: (identifier) @_method)
