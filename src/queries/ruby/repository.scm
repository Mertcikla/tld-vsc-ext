; class that inherits from ApplicationRecord or ActiveRecord::Base (Rails model)
(class
  superclass: (constant) @_super
  (#match? @_super "^(ApplicationRecord|Base)$")) @class

; ActiveRecord query method calls: Model.find, .where, .create, etc.
(call
  receiver: (constant)
  method: (identifier) @_meth
  (#match? @_meth "^(find|find_by|where|create|update|destroy|save|all|first|last|count|exists\\?|pluck|select|joins|includes|eager_load)$"))
